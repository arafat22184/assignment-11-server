require("dotenv").config();
const { MongoClient } = require("mongodb");

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ydu4ilk.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri);

async function updateWordCounts() {
  try {
    await client.connect();
    const blogify = client.db("blogify");
    const blogsCollection = blogify.collection("blogs");

    const cursor = blogsCollection.find({ wordCount: { $exists: false } });

    let updatedCount = 0;

    while (await cursor.hasNext()) {
      const blog = await cursor.next();
      const content = blog.content || "";
      const wordCount = content.trim().split(/\s+/).length;

      const result = await blogsCollection.updateOne(
        { _id: blog._id },
        { $set: { wordCount } }
      );

      if (result.modifiedCount > 0) {
        updatedCount++;
      }
    }

    console.log(`✅ wordCount added to ${updatedCount} blog(s).`);
  } catch (err) {
    console.error("Error updating wordCount:", err);
  } finally {
    await client.close();
  }
}

updateWordCounts();
