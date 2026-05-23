const express = require("express");
const { Pool } = require("pg");
const bodyParser = require("body-parser");
const session = require("express-session");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;
const ADMIN_PASS = process.env.ADMIN_PASS || "tiqzug-7rumvA-rymjuw";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : false
});

app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use(session({
  secret: process.env.SESSION_SECRET || "change-this-secret",
  resave: false,
  saveUninitialized: false
}));

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      tag TEXT,
      pinned BOOLEAN DEFAULT FALSE,
      created_at BIGINT NOT NULL
    )
  `);
}

function requireAdmin(req, res, next) {
  if (!req.session.auth) return res.redirect("/admin");
  next();
}

function clean(value) {
  return String(value || "").trim();
}

app.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM posts ORDER BY pinned DESC, created_at DESC"
    );

    res.render("index", { posts: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).send("database error");
  }
});

app.get("/submit", (req, res) => {
  res.render("submit", { error: null });
});

app.post("/submit", async (req, res) => {
  const title = clean(req.body.title);
  const content = clean(req.body.content);
  const tag = clean(req.body.tag) || "untagged";

  if (!title || !content) {
    return res.status(400).render("submit", {
      error: "title and story are required"
    });
  }

  try {
    await pool.query(
      "INSERT INTO posts (title, content, tag, created_at) VALUES ($1, $2, $3, $4)",
      [title, content, tag, Date.now()]
    );

    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.status(500).send("database error");
  }
});

app.get("/post/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM posts WHERE id = $1",
      [req.params.id]
    );

    if (!result.rows.length) return res.status(404).send("post not found");

    res.render("post", { post: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).send("database error");
  }
});

app.get("/tos", (req, res) => {
  res.render("tos");
});

app.get("/admin", async (req, res) => {
  if (!req.session.auth) {
    return res.render("login", { error: null });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM posts ORDER BY pinned DESC, created_at DESC"
    );

    res.render("admin", { posts: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).send("database error");
  }
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

app.post("/delete/:id", requireAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM posts WHERE id = $1", [req.params.id]);
    res.redirect("/admin");
  } catch (err) {
    console.error(err);
    res.status(500).send("database error");
  }
});

app.post("/pin/:id", requireAdmin, async (req, res) => {
  try {
    await pool.query(
      "UPDATE posts SET pinned = NOT pinned WHERE id = $1",
      [req.params.id]
    );

    res.redirect("/admin");
  } catch (err) {
    console.error(err);
    res.status(500).send("database error");
  }
});

initDb()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`running on ${PORT}`);
    });
  })
  .catch(err => {
    console.error("failed to start:", err);
    process.exit(1);
  });
