const express = require("express");
const cookieParser = require("cookie-parser");

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
app.get("/cookies/delete/:name", (req, res) => {
    res.clearCookie(req.params.name);
    res.redirect("/cookies");
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

// ─── START ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`tc-test server running on http://localhost:${PORT}`);
});
