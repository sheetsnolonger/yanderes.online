const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bodyParser = require("body-parser");
const session = require("express-session");
const path = require("path");

const app = express();
const db = new sqlite3.Database("./db.sqlite");

const PORT = process.env.PORT || 3000;
const ADMIN_PASS = process.env.ADMIN_PASS || "tiqzug-7rumvA-rymjuw";

app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use(session({
  secret: "yandere-secret",
  resave: false,
  saveUninitialized: false
}));

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    tag TEXT,
    pinned INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  )`);
});

function requireAdmin(req, res, next) {
  if (!req.session.auth) return res.redirect("/admin");
  next();
}

function clean(value) {
  return String(value || "").trim();
}

function deleteExpiredPosts() {
  const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  db.run("DELETE FROM posts WHERE pinned = 0 AND created_at < ?", [weekAgo]);
}

deleteExpiredPosts();
setInterval(deleteExpiredPosts, 60 * 60 * 1000);

app.get("/", (req, res) => {
  db.all("SELECT * FROM posts ORDER BY pinned DESC, created_at DESC", (err, posts) => {
    if (err) return res.status(500).send("database error");
    res.render("index", { posts });
  });
});

app.get("/submit", (req, res) => {
  res.render("submit", { error: null });
});

app.post("/submit", (req, res) => {
  const title = clean(req.body.title);
  const content = clean(req.body.content);
  const tag = clean(req.body.tag) || "untagged";

  if (!title || !content) {
    return res.status(400).render("submit", {
      error: "title and story are required"
    });
  }

  db.run(
    "INSERT INTO posts (title, content, tag, created_at) VALUES (?, ?, ?, ?)",
    [title, content, tag, Date.now()],
    err => {
      if (err) return res.status(500).send("database error");
      res.redirect("/");
    }
  );
});

app.get("/post/:id", (req, res) => {
  db.get("SELECT * FROM posts WHERE id = ?", [req.params.id], (err, post) => {
    if (err) return res.status(500).send("database error");
    if (!post) return res.status(404).send("post not found");
    res.render("post", { post });
  });
});

app.get("/admin", (req, res) => {
  if (!req.session.auth) {
    return res.render("login", { error: null });
  }

  db.all("SELECT * FROM posts ORDER BY pinned DESC, created_at DESC", (err, posts) => {
    if (err) return res.status(500).send("database error");
    res.render("admin", { posts });
  });
});

app.post("/admin", (req, res) => {
  if (req.body.pass === ADMIN_PASS) {
    req.session.auth = true;
    return res.redirect("/admin");
  }

  res.status(401).render("login", {
    error: "wrong password"
  });
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

app.post("/delete/:id", requireAdmin, (req, res) => {
  db.run("DELETE FROM posts WHERE id = ?", [req.params.id], () => {
    res.redirect("/admin");
  });
});

app.post("/pin/:id", requireAdmin, (req, res) => {
  db.run(
    "UPDATE posts SET pinned = CASE pinned WHEN 1 THEN 0 ELSE 1 END WHERE id = ?",
    [req.params.id],
    () => res.redirect("/admin")
  );
});

app.get("/tos", (req, res) => {
  res.render("tos");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`running on ${PORT}`);
});
