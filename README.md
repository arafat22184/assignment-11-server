# 🛠️ Blogify Server

This is the **backend API** for [Blogify](https://assignment-11-client-32ff9.web.app/), a full-stack blog platform that allows users to create, manage, and interact with blog posts. The server is built with **Node.js**, **Express.js**, and **MongoDB**, and it provides secure user authentication, CRUD operations for blogs and comments, wishlist management, and more.

---

## 🌐 Live Sites

- 🚀 **Client:** [Blogify Client](https://assignment-11-client-32ff9.web.app/)
- 🛠️ **Server:** [Blogify Server](https://assignment-11-server-lime-zeta.vercel.app/)

---

## 🚀 Key Features

- 🔐 Firebase Authentication & JWT Token Verification
- 📝 Blog CRUD with Update Permission Control
- 💬 Comment System (non-owners only)
- ⭐ Wishlist Functionality for Saved Blogs
- 📊 Featured Blogs Sorted by Word Count
- 🌐 RESTful API with CORS-enabled communication
- 🛡️ Environment Variables for Secure Configuration

---

## 📦 Tech Stack

| Category        | Tools & Libraries          |
|----------------|----------------------------|
| Runtime        | Node.js                    |
| Framework      | Express.js                 |
| Database       | MongoDB, Mongoose          |
| Auth           | Firebase Admin, JWT        |
| Env Config     | dotenv                     |
| Middleware     | CORS, express.json()       |
| Deployment     | Vercel                     |

---

## 🏁 Getting Started

Follow these steps to run the server locally:

### 1. Clone the Repository

```bash
git clone https://github.com/arafat22184/assignment-11-server.git
```

### 2. Change the Directory

```bash
cd assignment-11-server
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Create a `.env` File

```env
DB_USER=your_mongodb_user
DB_PASS=your_mongodb_pass
CLOUDINARY_CLOUD_NAME=your_cloudinary_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
FB_SERVICE_KEY=your_firebase_key
```

### 5. Start the Server

```bash
npm start
```

Your server should now be running at:  
➡️ `http://localhost:5000`

---

## 📌 Example API Endpoints

| Method | Endpoint            | Description                             |
|--------|---------------------|-----------------------------------------|
| GET    | /blogs              | Get all blogs                           |
| GET    | /blogs/:id          | Get blog details by ID                  |
| POST   | /blogs              | Create a new blog                       |
| PUT    | /blogs/:id          | Update blog (only by blog owner)        |
| DELETE | /blogs/:id          | Delete blog (only by blog owner)        |
| GET    | /wishlist/:email    | Get wishlist by user email              |
| POST   | /wishlist           | Add blog to wishlist                    |
| DELETE | /wishlist/:id       | Remove blog from wishlist               |
| POST   | /comments           | Post a comment on a blog                |
| GET    | /comments/:blogId   | Get all comments for a blog             |
| POST   | /jwt                | Generate a JWT access token             |

---

## 📁 Folder Structure

```
assignment-11-server/
├── .gitignore
├── .env
├── index.js
├── package.json
├── package-lock.json
├── README.md
├── addWordCount.js
├── cloudinary.js
├── addWordCount.js
├── vercel.json
```

---

## 🤝 Contributing

Contributions are welcome!  
Feel free to fork this repository, open issues, or submit pull requests to improve functionality or fix bugs.

---

<p align="center">
  <b>✨ Thank you for checking out the Blogify Server! ✨</b><br>
  <sub>Built with ❤️ by <a href="https://github.com/arafat22184">Al Arafat</a></sub>
</p>
