const express = require("express");
const cookieParser = require("cookie-parser");
const { graphql, buildSchema } = require("graphql");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// json()/urlencoded() only parse matching content-types; this catches the
// rest (text/plain, application/xml, text/xml, text/html, ...) as a raw
// string so XML/text-body requests still come through in req.body.
app.use(express.text({ type: ["text/*", "application/xml", "application/*+xml"] }));

// ─── ECHO ────────────────────────────────────────────────────────────────────
// Mirrors httpbin /anything — echoes method, url, headers, query, body, cookies
app.all("/anything", (req, res) => {
    res.json({
        method: req.method,
        url: `${req.protocol}://${req.get("host")}${req.originalUrl}`,
        headers: req.headers,
        query: req.query,
        body: req.body,
        cookies: req.cookies,
    });
});

// Same as /anything but with a path suffix -- mirrors httpbin /anything/*,
// useful for path-variable tests (e.g. /anything/123/456).
app.all("/anything/*", (req, res) => {
    res.json({
        method: req.method,
        url: `${req.protocol}://${req.get("host")}${req.originalUrl}`,
        headers: req.headers,
        query: req.query,
        body: req.body,
        cookies: req.cookies,
        pathSuffix: req.params[0],
        pathSegments: req.params[0].split("/").filter(Boolean),
    });
});

// ─── COOKIES ─────────────────────────────────────────────────────────────────
// Returns all cookies sent in the request (mirrors httpbin /cookies)
app.get("/cookies", (req, res) => {
    res.json({ cookies: req.cookies });
});

// Set a single cookie by name/value then redirect to /cookies
// Mirrors: httpbin /cookies/set/:name/:value
// NOTE: responds directly (200) instead of redirecting to /cookies. Confirmed
// via a real Thunder Client CLI run: a Set-Cookie header carried on a 302
// redirect response gets applied fine within that single request's own
// redirect-follow, but does NOT persist into the CLI's cookie jar for reuse
// by a later, separate `tc` invocation. A direct 200 response with
// Set-Cookie does persist correctly across invocations, so that's what
// cross-request cookie-persistence tests need here.
app.get("/cookies/set/:name/:value", (req, res) => {
    const { name, value } = req.params;
    res.cookie(name, value, { httpOnly: false });
    res.status(200).json({ cookies: { [name]: value } });
});

// Set multiple cookies via query params. Mirrors: httpbin /cookies/set?a=1&b=2&c=3
// See note above re: why this responds directly instead of redirecting.
app.get("/cookies/set", (req, res) => {
    for (const [name, value] of Object.entries(req.query)) {
        res.cookie(name, value, { httpOnly: false });
    }
    res.status(200).json({ cookies: req.query });
});

// Delete a single cookie by name then redirect to /cookies
// Mirrors: httpbin /cookies/delete/:name
// Responds directly (200) instead of redirecting -- same fix as /cookies/set:
// a Set-Cookie (here, a clear) carried on a 302 redirect response doesn't
// persist into the CLI's cross-invocation cookie jar, confirmed via a real run.
app.get("/cookies/delete/:name", (req, res) => {
    res.clearCookie(req.params.name);
    res.status(200).json({ deleted: req.params.name });
});

// ─── REDIRECTS ───────────────────────────────────────────────────────────────
// Chains exactly n redirects then returns 200
// Mirrors: httpbin /redirect/:n
app.get("/redirect/:n", (req, res) => {
    const n = parseInt(req.params.n, 10);

    if (isNaN(n) || n < 0) {
        return res.status(400).json({ error: "n must be a non-negative integer" });
    }

    if (n === 0) {
        return res.json({ message: "redirect chain complete" });
    }

    res.redirect(`/redirect/${n - 1}`);
});

// ─── CONTENT-TYPE FORCING ──────────────────────────────────────────────────
// Forces the response Content-Type to exactly the given mime type, no
// auto-appended charset (needed for exact-match Content-Type assertions).
// Mirrors: thunderclient.com/t/type?t=<mime>
app.get("/type", (req, res) => {
    const t = req.query.t || "text/plain";
    res.status(200);
    res.setHeader("Content-Type", t);
    res.end(Buffer.from("forced-content-type-body"));
});

// ─── STATUS ──────────────────────────────────────────────────────────────────
// Responds with the given status code. Mirrors: httpbin /status/:code
app.all("/status/:code", (req, res) => {
    const code = parseInt(req.params.code, 10) || 200;
    res.status(code).json({ status: code });
});

// ─── DELAY ───────────────────────────────────────────────────────────────────
// Waits `seconds` (capped at 30) then responds 200. Mirrors: httpbin /delay/:n
app.all("/delay/:seconds", (req, res) => {
    const seconds = Math.min(parseInt(req.params.seconds, 10) || 0, 30);
    setTimeout(() => {
        res.status(200).json({ delayedSeconds: seconds, message: "done" });
    }, seconds * 1000);
});

// ─── AUTH ────────────────────────────────────────────────────────────────────
// Mirrors: httpbin /basic-auth/:user/:pass
app.get("/basic-auth/:user/:pass", (req, res) => {
    const auth = req.headers.authorization || "";
    const expected = "Basic " + Buffer.from(`${req.params.user}:${req.params.pass}`).toString("base64");
    if (auth === expected) {
        return res.status(200).json({ authenticated: true, user: req.params.user });
    }
    res.setHeader("WWW-Authenticate", 'Basic realm="tc-test"');
    res.status(401).json({ authenticated: false });
});

// Mirrors: httpbin /bearer -- any non-empty bearer token is accepted.
app.get("/bearer", (req, res) => {
    const match = (req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
    if (match) {
        return res.status(200).json({ authenticated: true, token: match[1] });
    }
    res.status(401).json({ authenticated: false });
});

// ─── FAKE DATA (replaces jsonplaceholder.typicode.com) ────────────────────────
// Statically generated, deterministic -- same shape/scale as jsonplaceholder so
// existing json-query assertions (json[0].userId, json[-1].id, etc.) still hold.
const posts = Array.from({ length: 100 }, (_, i) => ({
    userId: Math.floor(i / 10) + 1,
    id: i + 1,
    title: `post title ${i + 1}`,
    body: `post body text for post ${i + 1}`,
}));

const users = Array.from({ length: 10 }, (_, i) => ({
    id: i + 1,
    name: `User ${i + 1}`,
    username: `user${i + 1}`,
    email: `user${i + 1}@example.com`,
}));

// jsonplaceholder's real /photos returns 5000 items; matched here so the
// responseLimit dual-run test still has a genuinely large payload to compare.
const photos = Array.from({ length: 5000 }, (_, i) => ({
    albumId: Math.floor(i / 50) + 1,
    id: i + 1,
    title: `photo title ${i + 1}`,
    url: `https://tc-test-server.onrender.com/files/photo-${i + 1}.jpg`,
    thumbnailUrl: `https://tc-test-server.onrender.com/files/thumb-${i + 1}.jpg`,
}));

app.get("/posts", (req, res) => res.status(200).json(posts));
app.get("/users", (req, res) => res.status(200).json(users));
app.get("/photos", (req, res) => res.status(200).json(photos));

// ─── SSE (Server-Sent Events) ───────────────────────────────────────────────
// Replaces sse.dev/test and postman-echo.com/server-events/:n.
// Streams `count` events (default 5) one per second, then ends the response.
app.get("/sse", (req, res) => {
    const count = Math.min(parseInt(req.query.count, 10) || 5, 50);
    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
    });
    let sent = 0;
    const interval = setInterval(() => {
        sent += 1;
        res.write(`id: ${sent}\ndata: ${JSON.stringify({ event: sent, message: "tick" })}\n\n`);
        if (sent >= count) {
            clearInterval(interval);
            res.end();
        }
    }, 1000);
    req.on("close", () => clearInterval(interval));
});

// ─── JSON served as text/plain ──────────────────────────────────────────────
// Edge case: valid JSON body, but the Content-Type header says text/plain
// instead of application/json -- tests whether TC still detects/parses it.
app.get("/json-as-text", (req, res) => {
    res.type("text/plain");
    res.send(JSON.stringify({ message: "valid json served as text/plain", number: 42 }));
});

// ─── Native XML response ─────────────────────────────────────────────────────
// A GET response that is genuinely XML (not an echo of a posted body), for
// testing XML response auto-detection/convert-to-JSON specifically.
app.get("/xml", (req, res) => {
    res.type("application/xml");
    res.send(
        "<catalog>" +
        "<product><name>Widget</name><price>19.99</price><inStock>true</inStock></product>" +
        "</catalog>"
    );
});

// ─── GRAPHQL ─────────────────────────────────────────────────────────────────
// Self-hosted replacement for countries.trevorblades.com/graphql, so GraphQL
// body tests don't depend on an external third-party API.
const graphqlSchema = buildSchema(`
    type Country {
        code: String
        name: String
        capital: String
        currency: String
        emoji: String
    }

    type Query {
        countries: [Country]
        country(code: String!): Country
    }
`);

const countries = [
    { code: "US", name: "United States", capital: "Washington D.C.", currency: "USD", emoji: "🇺🇸" },
    { code: "GB", name: "United Kingdom", capital: "London", currency: "GBP", emoji: "🇬🇧" },
    { code: "IN", name: "India", capital: "New Delhi", currency: "INR", emoji: "🇮🇳" },
    { code: "DE", name: "Germany", capital: "Berlin", currency: "EUR", emoji: "🇩🇪" },
    { code: "JP", name: "Japan", capital: "Tokyo", currency: "JPY", emoji: "🇯🇵" },
    { code: "AU", name: "Australia", capital: "Canberra", currency: "AUD", emoji: "🇦🇺" },
];

const graphqlRoot = {
    countries: () => countries,
    country: ({ code }) => countries.find((c) => c.code === code.toUpperCase()) || null,
};

app.post("/graphql", async (req, res) => {
    try {
        const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
        const { query, operationName } = body;
        let { variables } = body;

        // Thunder Client sends `variables` as a JSON-encoded string (e.g. "{}"),
        // not an object -- graphql-js requires a real object or throws.
        if (typeof variables === "string") {
            variables = variables.trim() === "" ? {} : JSON.parse(variables);
        }

        if (!query) {
            return res.status(400).json({ errors: [{ message: "Must provide query string." }] });
        }

        const result = await graphql({
            schema: graphqlSchema,
            source: query,
            rootValue: graphqlRoot,
            variableValues: variables || {},
            operationName,
        });
        res.status(200).json(result);
    } catch (err) {
        res.status(400).json({ errors: [{ message: err.message }] });
    }
});

// ─── WEBSOCKET ───────────────────────────────────────────────────────────────
// Replaces echo.websocket.org -- echoes back whatever message is sent.
// Attached to the SAME http.Server Express uses (one port, Render only
// routes external traffic to one port per web service).
const { WebSocketServer } = require("ws");
const http = require("http");
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
wss.on("connection", (ws) => {
    ws.send(JSON.stringify({ message: "connected" }));
    ws.on("message", (data) => {
        ws.send(data.toString());
    });
});

// ─── START ───────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
    console.log(`tc-test server running on http://localhost:${PORT}`);
});
