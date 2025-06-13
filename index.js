const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
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
    const wishlistsCollection = blogify.collection("wishlists");

    // Create text index
    try {
      await blogsCollection.createIndex({
        title: "text",
      });
    } catch (e) {
      console.log("Search index creation failed:", e.message);
    }

    // Improved search endpoint
    app.get("/blogs", async (req, res) => {
      try {
        const searchText = req.query?.search?.trim();

        // Not Search Text Send All Blogs
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
        res.status(500).json({ error: "Blogs Database error" });
      }
    });

    app.post("/blogs", async (req, res) => {
      const blogData = req.body;
      const result = await blogsCollection.insertOne(blogData);
      res.send(result);
    });

    // Specific Blog
    app.get("/blogs/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await blogsCollection.findOne(query);

      res.send(result);
    });

    // Comment Data on Specific Blog
    app.patch("/blogs/:id", async (req, res) => {
      const blogId = req.params.id;
      const commentData = req.body;
      const query = { _id: new ObjectId(blogId) };

      try {
        const result = await blogsCollection.updateOne(query, {
          $push: { comments: commentData },
        });

        if (result.modifiedCount > 0) {
          res
            .status(200)
            .send({ message: "Comment added successfully", success: true });
        } else {
          res.status(404).send({
            message: "Blog not found or no changes made",
            success: false,
          });
        }
      } catch (error) {
        console.error("Error adding comment:", error);
        res
          .status(500)
          .send({ message: "Internal Server Error", success: false });
      }
    });

    // Update Blog
    app.put("/blogs/:id", async (req, res) => {
      const blogId = req.params.id;
      const updateBlog = req.body;
      const query = { _id: new ObjectId(blogId) };
      const options = { upsert: true };

      const updateDoc = { $set: updateBlog };

      const result = await blogsCollection.updateOne(query, updateDoc, options);

      res.send(result);
    });

    // Recent blogs
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

    // Featured Blogs
    app.get("/featuredBlogs", async (req, res) => {
      try {
        const featuredBlogs = await blogsCollection
          .find()
          .sort({ wordCount: -1 })
          .limit(10)
          .toArray();

        res.send(featuredBlogs);
      } catch (error) {
        console.error("Error fetching featured blogs:", error);
        res.status(500).json({ error: "Failed to fetch featured blogs" });
      }
    });

    // Wishlist
    app.post("/wishlists", async (req, res) => {
      try {
        const { userId, blogId } = req.body;

        if (!userId || !blogId) {
          return res.status(400).send({ message: "Missing userId or blogId" });
        }

        const query = { userId, blogId };
        const existingWishlist = await wishlistsCollection.findOne(query);
        const blogQuery = { _id: new ObjectId(blogId) };

        if (existingWishlist) {
          // If it exists, remove from wishlist
          const deleteResult = await wishlistsCollection.deleteOne(query);

          // Remove userId from likes array
          await blogsCollection.updateOne(blogQuery, {
            $pull: { likes: userId },
          });

          return res.send({
            success: true,
            removed: true,
            message: "Removed from wishlist and blog unliked",
          });
        } else {
          // If it doesn't exist, add to wishlist
          const insertResult = await wishlistsCollection.insertOne({
            userId,
            blogId,
          });

          // Add userId to likes array only if not already in it
          await blogsCollection.updateOne(blogQuery, {
            $addToSet: { likes: userId },
          });

          return res.send({
            success: true,
            added: true,
            message: "Added to wishlist and blog liked",
          });
        }
      } catch (error) {
        console.error(error);
        res.status(500).send({ success: false, message: "Server error" });
      }
    });

    // Get wishlisted blogs for a user
    app.get("/wishlistedBlogs", async (req, res) => {
      try {
        const { userId } = req.query;
        if (!userId) {
          return res.status(400).send({ message: "Missing userId" });
        }

        const wishlistEntries = await wishlistsCollection
          .find({ userId })
          .toArray();

        const blogIds = wishlistEntries.map(
          (item) => new ObjectId(item.blogId)
        );

        const blogs = await blogsCollection
          .find({ _id: { $in: blogIds } })
          .toArray();

        res.send(blogs);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Server error" });
      }
    });

    // Check Is DB connected
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
