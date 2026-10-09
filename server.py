#!/usr/bin/env python3
"""BALLISTIC - simultaneous-turn hex arena server.

Pure standard library: serves ./public over HTTP and speaks WebSocket on the
same port. Run:  python server.py   (PORT env var overrides 8080)
"""
import asyncio
import base64
import hashlib
import json
import math
import mimetypes
import os
import random
import struct
import time

HOST = "0.0.0.0"
PORT = int(os.environ.get("PORT", 8080))
PUBLIC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public")
WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

MAX_PLAYERS = 6
ANIM_SEC = 1.7            # time clients get to animate a turn result
BOARD_RADIUS = 6.8        # circular cut of the hex grid -> 163 tiles
SUDDEN_DEATH_TURN = 30    # arena starts collapsing after this turn
COLLAPSE_EVERY = 4
MIN_RADIUS = 1.5
MAX_RANGE = 7
BALL_SPAWN_EVERY = 5

BOT_NAMES = ["Richard", "Big Johnson", "Willy", "Peter", "Moby", "Sir Longfellow",
             "Wang Chung", "Little Jimmy", "Captain Wood", "Shlongo"]

DIRS = [(1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)]


def tile_dist(q, r):
    """Euclidean distance from centre, in units of neighbour spacing."""
    return math.hypot(math.sqrt(3) * (q + r / 2), 1.5 * r) / math.sqrt(3)


def hex_dist(a, b):
    dq, dr = a[0] - b[0], a[1] - b[1]
    return (abs(dq) + abs(dr) + abs(dq + dr)) // 2


def neighbors(t):
    return [(t[0] + d[0], t[1] + d[1]) for d in DIRS]


def shot_range(balls):
    return min(1 + balls, MAX_RANGE)


ALL_TILES = [(q, r) for q in range(-9, 10) for r in range(-9, 10)
             if tile_dist(q, r) <= BOARD_RADIUS]


# --------------------------------------------------------------------------- game

class Game:
    def __init__(self, room):
        self.room = room
        self.tiles = set(ALL_TILES)
        self.radius = BOARD_RADIUS
        self.turn = 0
        self.players = {}
        self.loose = {}
        self.actions = {}
        self.all_in = asyncio.Event()
        self.task = None

        members = room.members
        n = len(members)
        taken = set()
        for i, m in enumerate(members):
            ang = 2 * math.pi * i / n - math.pi / 2
            tx, ty = 5 * math.cos(ang), 5 * math.sin(ang)
            best = min((t for t in ALL_TILES if t not in taken),
                       key=lambda t: math.hypot(t[0] + t[1] / 2 - tx, t[1] * 0.866 - ty))
            taken.add(best)
            self.players[m["id"]] = {
                "id": m["id"], "name": m["name"], "color": m["color"], "bot": m["bot"],
                "q": best[0], "r": best[1], "balls": 2, "alive": True, "died": None,
            }
        self.loose[(0, 0)] = 1
        for _ in range(max(0, n // 2 - 1)):
            self.spawn_ball()

    # ---- helpers
    def occupied(self):
        return {(p["q"], p["r"]) for p in self.players.values() if p["alive"]}

    def alive(self):
        return [p for p in self.players.values() if p["alive"]]

    def spawn_ball(self):
        occ = self.occupied()
        free = [t for t in self.tiles if t not in occ and t not in self.loose
                and tile_dist(*t) <= self.radius - 1]
        if free:
            self.loose[random.choice(free)] = 1

    def next_collapse(self):
        if self.radius - 1 < MIN_RADIUS:
            return None
        t = SUDDEN_DEATH_TURN
        while t < self.turn:
            t += COLLAPSE_EVERY
        return t

    def warn_radius(self):
        nc = self.next_collapse()
        if nc is not None and nc - self.turn <= 1:
            return self.radius - 1
        return None

    def state(self):
        return {
            "players": [{k: p[k] for k in ("id", "q", "r", "balls", "alive")}
                        for p in self.players.values()],
            "loose": [[t[0], t[1], c] for t, c in self.loose.items()],
            "radius": self.radius,
            "warn": self.warn_radius(),
        }

    # ---- flow
    async def run(self):
        room = self.room
        try:
            room.broadcast({"t": "gameStart", "turnSec": room.turn_sec,
                            "tiles": [list(t) for t in ALL_TILES],
                            "players": [{k: p[k] for k in ("id", "name", "color", "bot")}
                                        for p in self.players.values()],
                            "suddenDeath": SUDDEN_DEATH_TURN, "state": self.state()})
            await asyncio.sleep(2.5)
            while True:
                self.turn += 1
                self.actions = {}
                self.all_in.clear()
                for p in self.alive():
                    if p["bot"]:
                        self.actions[p["id"]] = self.bot_action(p)
                room.broadcast({"t": "turn", "n": self.turn, "ms": int(room.turn_sec * 1000),
                                "state": self.state()})
                self.check_all_in()
                try:
                    await asyncio.wait_for(self.all_in.wait(), timeout=room.turn_sec)
                except asyncio.TimeoutError:
                    pass
                room.broadcast(self.resolve())
                await asyncio.sleep(ANIM_SEC)
                alive = self.alive()
                humans_alive = [p for p in alive if not p["bot"]]
                if len(alive) <= 1 or (not humans_alive and not room.has_spectators()):
                    break
            self.finish()
        except asyncio.CancelledError:
            pass

    def finish(self):
        alive = self.alive()
        winner = alive[0] if len(alive) == 1 else None
        ranking = sorted(self.players.values(),
                         key=lambda p: (p["alive"], p["died"] or 0, p["balls"]), reverse=True)
        self.room.broadcast({
            "t": "over",
            "winner": {"id": winner["id"], "name": winner["name"], "color": winner["color"]} if winner else None,
            "ranking": [{"id": p["id"], "name": p["name"], "color": p["color"],
                         "died": p["died"], "balls": p["balls"]} for p in ranking],
            "turns": self.turn,
        })
        self.room.game = None
        self.room.state = "lobby"
        self.room.broadcast_info()
        lobby_changed()

    def check_all_in(self):
        if all(p["id"] in self.actions for p in self.alive()):
            self.all_in.set()

    def submit(self, pid, a):
        p = self.players.get(pid)
        if not p or not p["alive"] or not isinstance(a, dict):
            return
        typ = a.get("type")
        if typ not in ("move", "shoot", "stay"):
            return
        try:
            q, r = int(a.get("q", 0)), int(a.get("r", 0))
        except (TypeError, ValueError):
            return
        self.actions[pid] = {"type": typ, "q": q, "r": r}
        self.room.broadcast({"t": "locked", "ids": list(self.actions.keys())})
        self.check_all_in()

    def forfeit(self, pid):
        p = self.players.get(pid)
        if p and p["alive"]:
            p["alive"] = False
            p["balls"] = 0
            p["died"] = self.turn
            self.check_all_in()

    # ---- resolution
    def resolve(self):
        alive = self.alive()
        pos = {p["id"]: (p["q"], p["r"]) for p in alive}
        desired = dict(pos)
        attempted = {}
        shots = []
        for p in alive:
            a = self.actions.get(p["id"])
            if not a:
                continue
            tgt = (a["q"], a["r"])
            here = pos[p["id"]]
            if a["type"] == "move" and tgt in self.tiles and hex_dist(tgt, here) == 1:
                desired[p["id"]] = tgt
                attempted[p["id"]] = tgt
            elif (a["type"] == "shoot" and tgt in self.tiles
                  and 1 <= hex_dist(tgt, here) <= shot_range(p["balls"])):
                shots.append((p["id"], tgt))

        # movement conflicts: anyone fighting for a tile (or swapping) stays put
        changed = True
        while changed:
            changed = False
            claims = {}
            for pid, d in desired.items():
                claims.setdefault(d, []).append(pid)
            for d, pids in claims.items():
                if len(pids) > 1:
                    for pid in pids:
                        if desired[pid] != pos[pid]:
                            desired[pid] = pos[pid]
                            changed = True
            ids = list(desired)
            for i, a in enumerate(ids):
                for b in ids[i + 1:]:
                    if desired[a] == pos[b] and desired[b] == pos[a] and desired[a] != pos[a]:
                        desired[a], desired[b] = pos[a], pos[b]
                        changed = True

        moves = []
        for p in alive:
            pid = p["id"]
            if pid in attempted:
                moves.append({"id": pid, "from": list(pos[pid]), "to": list(attempted[pid]),
                              "blocked": desired[pid] == pos[pid]})
            p["q"], p["r"] = desired[pid]

        pickups = []
        for p in alive:
            t = (p["q"], p["r"])
            if t in self.loose:
                c = self.loose.pop(t)
                p["balls"] += c
                pickups.append({"id": p["id"], "at": list(t), "count": c})

        shot_events, drops = [], []
        occ = self.occupied()
        for shooter, tgt in shots:
            victims = [p for p in alive if (p["q"], p["r"]) == tgt]
            hit_ids = []
            for v in victims:
                if v["balls"] <= 0:
                    continue
                v["balls"] -= 1
                hit_ids.append(v["id"])
                if self.turn >= SUDDEN_DEATH_TURN:
                    # sudden death: knocked-off balls fly out of the arena for good
                    drops.append({"id": v["id"], "from": list(tgt), "to": None})
                    continue
                drop = self.drop_tile(tgt, occ)
                self.loose[drop] = self.loose.get(drop, 0) + 1
                drops.append({"id": v["id"], "from": list(tgt), "to": list(drop)})
            shot_events.append({"id": shooter, "from": list(pos[shooter]), "to": list(tgt), "hits": hit_ids})

        deaths = []
        for p in alive:
            if p["balls"] <= 0 and p["alive"]:
                p["alive"] = False
                p["died"] = self.turn
                deaths.append({"id": p["id"], "how": "nuts"})

        collapsed = False
        nc = self.next_collapse()
        if nc is not None and nc == self.turn:
            collapsed = True
            self.radius -= 1
            gone = {t for t in self.tiles if tile_dist(*t) > self.radius}
            self.tiles -= gone
            for t in list(self.loose):
                if t in gone:
                    del self.loose[t]
            for p in self.alive():
                if (p["q"], p["r"]) in gone:
                    p["alive"] = False
                    p["balls"] = 0
                    p["died"] = self.turn
                    deaths.append({"id": p["id"], "how": "fell"})

        if (self.turn < SUDDEN_DEATH_TURN and self.turn % BALL_SPAWN_EVERY == 0
                and sum(self.loose.values()) < 3):
            self.spawn_ball()

        return {"t": "result", "n": self.turn, "moves": moves, "shots": shot_events,
                "drops": drops, "pickups": pickups, "deaths": deaths,
                "collapsed": collapsed, "state": self.state()}

    def drop_tile(self, at, occ):
        near = [t for t in self.tiles if 1 <= hex_dist(t, at) <= 2 and t not in occ]
        empty = [t for t in near if t not in self.loose]
        pool = empty or near or [at]
        return random.choice(pool)

    # ---- bots
    def bot_action(self, me):
        mp = (me["q"], me["r"])
        rng = shot_range(me["balls"])
        enemies = [(p["q"], p["r"]) for p in self.alive() if p["id"] != me["id"]]
        warn = self.warn_radius()
        danger = lambda t: warn is not None and tile_dist(*t) > warn
        in_range = [e for e in enemies if 1 <= hex_dist(mp, e) <= rng]

        if in_range and not danger(mp) and random.random() < 0.65:
            ep = random.choice(in_range)
            if random.random() < 0.45:
                guess = ep
            else:
                guess = random.choice([n for n in neighbors(ep) if n in self.tiles] or [ep])
            if not 1 <= hex_dist(mp, guess) <= rng:
                guess = ep
            return {"type": "shoot", "q": guess[0], "r": guess[1]}

        occ = self.occupied()
        steps = [n for n in neighbors(mp) if n in self.tiles and n not in occ and not danger(n)]
        if not steps:
            return {"type": "stay", "q": mp[0], "r": mp[1]}
        if random.random() < 0.2:
            s = random.choice(steps)
            return {"type": "move", "q": s[0], "r": s[1]}
        if danger(mp):
            goal = (0, 0)
        elif self.loose:
            goal = min(self.loose, key=lambda t: hex_dist(t, mp))
            if hex_dist(goal, mp) > 6 and enemies:
                goal = min(enemies, key=lambda t: hex_dist(t, mp))
        elif enemies:
            goal = min(enemies, key=lambda t: hex_dist(t, mp))
            if hex_dist(goal, mp) <= rng:
                s = random.choice(steps)
                return {"type": "move", "q": s[0], "r": s[1]}
        else:
            goal = (0, 0)
        random.shuffle(steps)
        s = min(steps, key=lambda t: hex_dist(t, goal))
        return {"type": "move", "q": s[0], "r": s[1]}


# --------------------------------------------------------------------------- rooms

clients = set()
rooms = {}
_next_id = 0


def new_id():
    global _next_id
    _next_id += 1
    return f"p{_next_id}"


def room_code():
    letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"
    while True:
        c = "".join(random.choice(letters) for _ in range(4))
        if c not in rooms:
            return c


def clean(s, n):
    s = "".join(ch for ch in str(s or "") if ch.isprintable()).strip()
    return s[:n]


class Room:
    def __init__(self, name, host, turn_sec, public):
        self.code = room_code()
        self.name = name
        self.host = host.id
        self.turn_sec = turn_sec
        self.public = public
        self.members = []
        self.state = "lobby"
        self.game = None

    def free_color(self):
        used = {m["color"] for m in self.members}
        return next(i for i in range(MAX_PLAYERS) if i not in used)

    def add_client(self, c):
        self.members.append({"id": c.id, "name": c.name, "color": self.free_color(),
                             "bot": False, "client": c})
        c.room = self

    def humans(self):
        return [m for m in self.members if not m["bot"]]

    def has_spectators(self):
        return bool(self.humans())

    def broadcast(self, obj):
        data = json.dumps(obj)
        for m in self.members:
            if m["client"]:
                m["client"].send_raw(data)

    def info(self):
        return {"code": self.code, "name": self.name, "host": self.host,
                "turnSec": self.turn_sec, "state": self.state, "public": self.public,
                "players": [{"id": m["id"], "name": m["name"], "color": m["color"], "bot": m["bot"]}
                            for m in self.members]}

    def broadcast_info(self):
        self.broadcast({"t": "room", "room": self.info()})

    def remove(self, pid):
        self.members = [m for m in self.members if m["id"] != pid]
        if self.game:
            self.game.forfeit(pid)
        if not self.humans():
            if self.game and self.game.task:
                self.game.task.cancel()
            rooms.pop(self.code, None)
        else:
            if self.host == pid:
                self.host = self.humans()[0]["id"]
            self.broadcast_info()
        lobby_changed()


def room_list():
    return [{"code": r.code, "name": r.name, "count": len(r.members), "max": MAX_PLAYERS,
             "state": r.state, "turnSec": r.turn_sec}
            for r in rooms.values() if r.public]


def lobby_changed():
    data = json.dumps({"t": "rooms", "rooms": room_list()})
    for c in list(clients):
        if c.room is None and c.name:
            c.send_raw(data)


# --------------------------------------------------------------------------- websocket

class Client:
    def __init__(self, reader, writer):
        self.reader = reader
        self.writer = writer
        self.id = new_id()
        self.name = ""
        self.room = None
        self.closed = False
        self.last_chat = 0.0

    def send_raw(self, text):
        if self.closed:
            return
        data = text.encode()
        n = len(data)
        if n < 126:
            hdr = struct.pack("!BB", 0x81, n)
        elif n < 65536:
            hdr = struct.pack("!BBH", 0x81, 126, n)
        else:
            hdr = struct.pack("!BBQ", 0x81, 127, n)
        try:
            self.writer.write(hdr + data)
        except Exception:
            self.closed = True

    def send(self, obj):
        self.send_raw(json.dumps(obj))

    async def recv(self):
        buf = b""
        while True:
            h = await self.reader.readexactly(2)
            fin, op = h[0] & 0x80, h[0] & 0x0F
            masked, ln = h[1] & 0x80, h[1] & 0x7F
            if ln == 126:
                ln = struct.unpack("!H", await self.reader.readexactly(2))[0]
            elif ln == 127:
                ln = struct.unpack("!Q", await self.reader.readexactly(8))[0]
            if ln > 65536:
                return None
            mask = await self.reader.readexactly(4) if masked else b"\0\0\0\0"
            payload = bytearray(await self.reader.readexactly(ln))
            for i in range(ln):
                payload[i] ^= mask[i & 3]
            if op == 0x8:
                return None
            if op == 0x9:
                self.writer.write(struct.pack("!BB", 0x8A, len(payload)) + bytes(payload))
                continue
            if op == 0xA:
                continue
            buf += payload
            if fin:
                return buf.decode("utf-8", "replace")

    def error(self, msg):
        self.send({"t": "error", "msg": msg})

    async def handle(self, msg):
        t = msg.get("t")
        if t == "hello":
            self.name = clean(msg.get("name"), 14) or "Anonymous"
            self.send({"t": "welcome", "id": self.id, "name": self.name})
            self.send({"t": "rooms", "rooms": room_list()})
            return
        if not self.name:
            return
        room = self.room

        if t == "list":
            self.send({"t": "rooms", "rooms": room_list()})
        elif t == "create":
            if room:
                return
            sec = msg.get("turnSec", 4)
            sec = sec if sec in (3, 4, 5) else 4
            name = clean(msg.get("name"), 20) or f"{self.name}'s room"
            r = Room(name, self, sec, bool(msg.get("public", True)))
            rooms[r.code] = r
            r.add_client(self)
            r.broadcast_info()
            lobby_changed()
        elif t == "join":
            if room:
                return
            r = rooms.get(clean(msg.get("code"), 4).upper())
            if not r:
                return self.error("Room not found")
            if r.state != "lobby":
                return self.error("Game already in progress")
            if len(r.members) >= MAX_PLAYERS:
                return self.error("Room is full")
            r.add_client(self)
            r.broadcast_info()
            r.broadcast({"t": "chat", "sys": True, "text": f"{self.name} joined"})
            lobby_changed()
        elif not room:
            return
        elif t == "leave":
            self.room = None
            room.remove(self.id)
            room.broadcast({"t": "chat", "sys": True, "text": f"{self.name} left"})
            self.send({"t": "left"})
            self.send({"t": "rooms", "rooms": room_list()})
        elif t == "chat":
            text = clean(msg.get("text"), 120)
            now = time.time()
            if text and now - self.last_chat > 0.4:
                self.last_chat = now
                me = next((m for m in room.members if m["id"] == self.id), None)
                room.broadcast({"t": "chat", "name": self.name, "color": me["color"] if me else 0, "text": text})
        elif t == "act":
            if room.game:
                room.game.submit(self.id, msg.get("a"))
        elif room.host != self.id or room.state != "lobby":
            return
        elif t == "addBot":
            if len(room.members) >= MAX_PLAYERS:
                return self.error("Room is full")
            used = {m["name"] for m in room.members}
            name = next((n for n in random.sample(BOT_NAMES, len(BOT_NAMES)) if n not in used), "Bot")
            room.members.append({"id": new_id(), "name": name, "color": room.free_color(),
                                 "bot": True, "client": None})
            room.broadcast_info()
            lobby_changed()
        elif t == "kick":
            pid = msg.get("id")
            if any(m["id"] == pid and m["bot"] for m in room.members):
                room.remove(pid)
        elif t == "settings":
            sec = msg.get("turnSec")
            if sec in (3, 4, 5):
                room.turn_sec = sec
                room.broadcast_info()
                lobby_changed()
        elif t == "start":
            if len(room.members) < 2:
                return self.error("Need at least 2 players (add a bot!)")
            room.state = "playing"
            room.game = Game(room)
            room.game.task = asyncio.create_task(room.game.run())
            room.broadcast_info()
            lobby_changed()


# --------------------------------------------------------------------------- http

async def serve_static(writer, path, method="GET"):
    path = path.split("?", 1)[0].split("#", 1)[0]
    if path in ("", "/"):
        path = "/index.html"
    full = os.path.normpath(os.path.join(PUBLIC, path.lstrip("/")))
    if not full.startswith(PUBLIC) or not os.path.isfile(full):
        body, status, ctype = b"Not found", "404 Not Found", "text/plain"
    else:
        with open(full, "rb") as f:
            body = f.read()
        status = "200 OK"
        ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype.endswith("javascript"):
            ctype += "; charset=utf-8"
    writer.write((f"HTTP/1.1 {status}\r\nContent-Type: {ctype}\r\nContent-Length: {len(body)}\r\n"
                  f"Cache-Control: no-cache\r\nConnection: close\r\n\r\n").encode()
                 + (b"" if method == "HEAD" else body))
    await writer.drain()


async def on_connection(reader, writer):
    client = None
    try:
        raw = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), timeout=10)
        lines = raw.decode("latin1").split("\r\n")
        parts = lines[0].split(" ")
        path = parts[1] if len(parts) > 1 else "/"
        headers = {}
        for line in lines[1:]:
            if ":" in line:
                k, v = line.split(":", 1)
                headers[k.strip().lower()] = v.strip()

        if headers.get("upgrade", "").lower() != "websocket":
            await serve_static(writer, path, parts[0])
            return

        accept = base64.b64encode(hashlib.sha1((headers["sec-websocket-key"] + WS_GUID).encode()).digest()).decode()
        writer.write(("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                      f"Sec-WebSocket-Accept: {accept}\r\n\r\n").encode())
        await writer.drain()

        client = Client(reader, writer)
        clients.add(client)
        while True:
            text = await client.recv()
            if text is None:
                break
            try:
                msg = json.loads(text)
            except ValueError:
                continue
            if isinstance(msg, dict):
                await client.handle(msg)
            await writer.drain()
    except (asyncio.IncompleteReadError, asyncio.TimeoutError, ConnectionError, asyncio.LimitOverrunError, KeyError):
        pass
    except Exception as e:  # keep the server alive no matter what one socket does
        print("connection error:", repr(e))
    finally:
        if client:
            client.closed = True
            clients.discard(client)
            if client.room:
                r = client.room
                client.room = None
                r.remove(client.id)
                r.broadcast({"t": "chat", "sys": True, "text": f"{client.name} disconnected"})
        try:
            writer.close()
        except Exception:
            pass


async def main():
    mimetypes.add_type("application/javascript", ".js")
    server = await asyncio.start_server(on_connection, HOST, PORT)
    print(f"BALLISTIC server running on http://localhost:{PORT}  ({len(ALL_TILES)} tiles)")
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
