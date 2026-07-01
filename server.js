const express = require("express");
const cookieParser = require("cookie-parser");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// ─── COOKIES ─────────────────────────────────────────────────────────────────
// Returns all cookies sent in the request (mirrors httpbin /cookies)
app.get("/cookies", (req, res) => {
    res.json({ cookies: req.cookies });
});

// Set a single cookie by name/value then redirect to /cookies
// Mirrors: httpbin /cookies/set/:name/:value
app.get("/cookies/set/:name/:value", (req, res) => {
    const { name, value } = req.params;
    res.cookie(name, value, { httpOnly: false });
    res.redirect("/cookies");
});

// Set multiple cookies via query params then redirect to /cookies
// Mirrors: httpbin /cookies/set?a=1&b=2&c=3
app.get("/cookies/set", (req, res) => {
    for (const [name, value] of Object.entries(req.query)) {
        res.cookie(name, value, { httpOnly: false });
    }
    res.redirect("/cookies");
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

// ─── START ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`tc-test server running on http://localhost:${PORT}`);
});
