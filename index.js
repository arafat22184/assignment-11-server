const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const cors = require("cors");
const port = process.env.PORT || 3000;
require("dotenv").config();
const admin = require("firebase-admin");

// Init Firebase
const serviceAccount = require("./firebase-admin-key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Middleware
app.use(express.json());
app.use(cors({ origin: ["http://localhost:5173"] }));

// Verify Firebase access Token
const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers?.authorization || "";

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send({ message: "unauthorized access" });
  }

  const idToken = authHeader.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : null;

  if (!idToken) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.decoded = decodedToken;
    next();
  } catch (error) {
    return res.status(403).json({ error: "Unauthorized access" });
  }
};

// Verify User Email
const verifyEmail = async (req, res, next) => {
  if (req.headers.email !== req.decoded.email) {
    return res.status(403).send({ message: "Forbidden access" });
  }
  next();
};

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
    const commentsCollection = blogify.collection("comments");

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
        res.status(500).json({ error: "Blogs Database error" });
      }
    });

    app.post("/blogs", verifyFirebaseToken, verifyEmail, async (req, res) => {
      const blogData = req.body;
      const result = await blogsCollection.insertOne(blogData);
      res.send(result);
    });

    // Specific Blog
    app.get(
      "/blogs/:id",
      verifyFirebaseToken,
      verifyEmail,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await blogsCollection.findOne(query);

        res.send(result);
      }
    );

    // For Comment Seperate Collection
    app.get("/comments/:blogId", async (req, res) => {
      try {
        const blogId = req.params.blogId;

        if (!ObjectId.isValid(blogId)) {
          return res
            .status(400)
            .json({ success: false, message: "Invalid blog ID" });
        }

        const comments = await commentsCollection
          .find({
            blogId: new ObjectId(blogId),
          })
          .sort({ postedAt: -1 })
          .toArray();

        res.status(200).json({ success: true, data: comments });
      } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
      }
    });

    // Post Comment
    app.post(
      "/comments",
      verifyFirebaseToken,
      verifyEmail,
      async (req, res) => {
        try {
          const { blogId, text, userImage, userName } = req.body;

          // Data Validation
          if (!blogId || !text || !userName) {
            return res
              .status(400)
              .json({ success: false, message: "Missing required fields" });
          }

          const comment = {
            blogId: new ObjectId(blogId),
            text,
            userImage: userImage || null,
            userName,
            postedAt: new Date(),
          };

          const result = await commentsCollection.insertOne(comment);

          res
            .status(201)
            .json({ success: true, message: "Comment posted", comment });
        } catch (error) {
          res.status(500).json({ success: false, message: "Server error" });
        }
      }
    );

    // Update Blog
    app.put(
      "/blogs/:id",
      verifyFirebaseToken,
      verifyEmail,
      async (req, res) => {
        const blogId = req.params.id;
        const updateBlog = req.body;
        const query = { _id: new ObjectId(blogId) };
        const options = { upsert: true };

        const updateDoc = { $set: updateBlog };

        const result = await blogsCollection.updateOne(
          query,
          updateDoc,
          options
        );

        res.send(result);
      }
    );

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
        res.status(500).json({ error: "Failed to fetch featured blogs" });
      }
    });

    // Wishlist
    app.post(
      "/wishlists",
      verifyFirebaseToken,
      verifyEmail,
      async (req, res) => {
        try {
          const { userId, blogId } = req.body;

          if (!userId || !blogId) {
            return res
              .status(400)
              .send({ message: "Missing userId or blogId" });
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
          res.status(500).send({ success: false, message: "Server error" });
        }
      }
    );

    // Get wishlisted blogs for a user
    app.get(
      "/wishlistedBlogs",
      verifyFirebaseToken,
      verifyEmail,
      async (req, res) => {
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
          res.status(500).send({ message: "Server error" });
        }
      }
    );

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
