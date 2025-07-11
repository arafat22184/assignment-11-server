const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const cors = require("cors");
const port = process.env.PORT || 3000;
require("dotenv").config();
const admin = require("firebase-admin");
// Cloudinary
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const { cloudinary } = require("./cloudinary");
const streamifier = require("streamifier");

// Init Firebase
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf-8"
);
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Middleware
app.use(express.json());
app.use(cors());

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
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const blogify = client.db("blogify");
    const blogsCollection = blogify.collection("blogs");
    const wishlistsCollection = blogify.collection("wishlists");
    const commentsCollection = blogify.collection("comments");

    // Improved search endpoint
    app.get("/blogs", async (req, res) => {
      try {
        const searchText = req.query?.search?.trim();

        // No search text: return all blogs
        if (!searchText) {
          const result = await blogsCollection.find().toArray();
          return res.json(result);
        }

        // Case-insensitive regex search only on title
        const regex = new RegExp(searchText, "i");

        const result = await blogsCollection
          .find({ title: { $regex: regex } })
          .toArray();

        return res.json(result);
      } catch (error) {
        res.status(500).json({ error: "Blogs Database error" });
      }
    });

    app.post(
      "/blogs",
      verifyFirebaseToken,
      verifyEmail,
      upload.single("imageFile"),
      async (req, res) => {
        try {
          const {
            title,
            category,
            content,
            tags,
            shortDescription,
            wordCount,
            imageUrl,
            authorName,
            authorEmail,
            authorPhoto,
          } = req.body;

          let finalImageUrl = imageUrl;

          if (req.file) {
            const streamUpload = () =>
              new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                  {
                    folder: "blog_images",
                  },
                  (error, result) => {
                    if (result) resolve(result);
                    else reject(error);
                  }
                );
                streamifier.createReadStream(req.file.buffer).pipe(stream);
              });

            const result = await streamUpload();
            finalImageUrl = result.secure_url;
          }

          const blogData = {
            title,
            category,
            content,
            tags: JSON.parse(tags),
            shortDescription,
            wordCount: Number(wordCount),
            image: finalImageUrl,
            createdAt: new Date(),
            author: {
              name: authorName,
              email: authorEmail,
              photo: authorPhoto,
            },
            likes: [],
          };

          const result = await blogsCollection.insertOne(blogData);
          res.send(result);
        } catch (err) {
          res.status(500).json({ error: "Blog upload failed." });
        }
      }
    );

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

    function extractPublicId(url) {
      if (!url) return null;

      const matches = url.match(/upload\/(?:v\d+\/)?([^\.]+)/);
      return matches ? matches[1] : null;
    }

    // Blog Update
    app.put(
      "/blogs/:id",
      verifyFirebaseToken,
      verifyEmail,
      upload.single("imageFile"),
      async (req, res) => {
        try {
          const blogId = req.params.id;
          const query = { _id: new ObjectId(blogId) };

          // First get the existing blog to access the old image
          const existingBlog = await blogsCollection.findOne(query);
          if (!existingBlog) {
            return res.status(404).json({ error: "Blog not found" });
          }

          const {
            title,
            category,
            content,
            tags,
            shortDescription,
            wordCount,
            imageUrl,
            authorName,
            authorEmail,
            authorPhoto,
          } = req.body;

          let finalImageUrl = imageUrl;

          // If a new image file is uploaded
          if (req.file) {
            // First delete the old image if it exists and is from Cloudinary
            if (existingBlog.image) {
              try {
                const publicId = extractPublicId(existingBlog.image);
                if (publicId) {
                  await cloudinary.uploader.destroy(publicId);
                }
              } catch (err) {
                console.error("Error deleting old image:", err);
              }
            }

            // Upload the new image
            const streamUpload = () =>
              new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                  {
                    folder: "blog_images",
                  },
                  (error, result) => {
                    if (result) resolve(result);
                    else reject(error);
                  }
                );
                streamifier.createReadStream(req.file.buffer).pipe(stream);
              });

            const result = await streamUpload();
            finalImageUrl = result.secure_url;
          } else if (imageUrl && imageUrl !== existingBlog.image) {
            // If image URL changed and no file uploaded, delete old Cloudinary image
            if (existingBlog.image) {
              try {
                const publicId = extractPublicId(existingBlog.image);
                if (publicId) {
                  await cloudinary.uploader.destroy(publicId);
                }
              } catch (err) {
                console.error("Error deleting old image:", err);
              }
            }
          }

          const updateDoc = {
            $set: {
              title,
              category,
              content,
              tags: JSON.parse(tags),
              shortDescription,
              wordCount: Number(wordCount),
              image: finalImageUrl,
              author: {
                name: authorName,
                email: authorEmail,
                photo: authorPhoto,
              },
            },
          };

          const result = await blogsCollection.updateOne(query, updateDoc);
          res.send(result);
        } catch (err) {
          res.status(500).json({ error: "Failed to update blog." });
        }
      }
    );

    app.get("/recentBlogs", async (req, res) => {
      try {
        const result = await blogsCollection
          .find()
          .sort({ createdAt: -1 })
          .limit(8)
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
