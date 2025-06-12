const express = require("express");
const { MongoClient, ServerApiVersion } = require("mongodb");
const app = express();
const cors = require("cors");
const port = process.env.PORT || 3000;
require("dotenv").config();

// Middleware
app.use(express.json());
app.use(cors());

// MONGODB
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ydu4ilk.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
  },
});

async function run() {
  try {
    await client.connect();
    const blogify = client.db("blogify");
    const blogsCollection = blogify.collection("blogs");

    // Create text index
    try {
      await blogsCollection.createIndex({
        title: "text",
      });
      console.log("Text index created successfully");
    } catch (e) {
      console.log("Search index creation failed:", e.message);
    }

    // Improved search endpoint
    app.get("/blogs", async (req, res) => {
      try {
        const searchText = req.query.search?.trim();

        if (!searchText) {
          const result = await blogsCollection.find().toArray();
          return res.json(result);
        }

        // Try text search first
        let result = await blogsCollection
          .find({ $text: { $search: searchText } })
          .project({ score: { $meta: "textScore" } })
          .sort({ score: { $meta: "textScore" } })
          .toArray();

        // If text search returns empty or we're searching for a small word (likely a stop word)
        if (result.length === 0 || searchText.length <= 3) {
          const regex = new RegExp(searchText, "i");
          result = await blogsCollection
            .find({
              $or: [
                { title: regex },
                { shortDescription: regex },
                { tags: regex },
              ],
            })
            .toArray();
        }

        return res.json(result);
      } catch (error) {
        console.error("Search error:", error);
        res.status(500).json({ error: "Database error" });
      }
    });

    // Recent blogs endpoint
    app.get("/recentBlogs", async (req, res) => {
      try {
        const result = await blogsCollection
          .find()
          .sort({ createdAt: -1 })
          .limit(6)
          .toArray();
        res.send(result);
      } catch (error) {
        res.status(500).json({ error: "Database error" });
      }
    });

    await client.db("admin").command({ ping: 1 });
    console.log("Successfully connected to MongoDB!");
  } finally {
    // Client will remain connected
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Blogify Running");
});

app.listen(port, () => {
  console.log(`Blogify running on port ${port}`);
});
