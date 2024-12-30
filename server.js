const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// MongoDB connection
mongoose.connect("mongodb+srv://kraj:Champion1685@cluster0.o7g0j.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log("Connected to MongoDB"))
  .catch(err => console.log("MongoDB connection error:", err));

// Mongoose models
const User = mongoose.model("User", new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  unreadMessages: { type: Map, of: Number, default: {} }, // stores unread messages count per user
}));

const Message = mongoose.model("Message", new mongoose.Schema({
  sender: String,
  receiver: String,
  message: String,
  timestamp: { type: Date, default: Date.now },
}));

const activeUsers = new Map(); // Store users and their socket IDs

app.use(express.static("public"));

// Socket.IO connections
io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  // Handle new user connection
  socket.on("setUsername", async (username) => {
    const user = await User.findOneAndUpdate({ username }, { username }, { upsert: true });
    activeUsers.set(socket.id, username);
    io.emit("userList", Array.from(activeUsers.values())); // Emit updated list of active users
  });

  // Handle private message
  socket.on("privateMessage", async ({ targetUsername, message }) => {
    const sender = activeUsers.get(socket.id);
    const targetSocketId = [...activeUsers.entries()].find(([_, username]) => username === targetUsername)?.[0];

    if (targetSocketId) {
      io.to(targetSocketId).emit("privateMessage", { sender, message });
      socket.emit("privateMessage", { sender, message });

      // Save the message in MongoDB
      await Message.create({ sender, receiver: targetUsername, message });

      // Update unread messages count for the target user
      const targetUser = await User.findOne({ username: targetUsername });
      if (targetUser) {
        const unreadMessages = targetUser.unreadMessages.get(sender) || 0;
        targetUser.unreadMessages.set(sender, unreadMessages + 1);
        await targetUser.save();
      }
    } else {
      socket.emit("errorMessage", { error: "User not found" });
    }
  });

  // Handle group messages
  socket.on("groupMessage", (message) => {
    const sender = activeUsers.get(socket.id);
    io.emit("groupMessage", { sender, message });
  });

  // Handle user disconnection
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    activeUsers.delete(socket.id);
    io.emit("userList", Array.from(activeUsers.values()));
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
