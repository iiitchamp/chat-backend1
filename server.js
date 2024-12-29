const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");

// Connect to MongoDB (you can replace the connection string with your own)
mongoose
  .connect("mongodb+srv://kraj:Champion1685@cluster0.o7g0j.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// Store active users in a Map (username -> socketId)
const activeUsers = new Map();

// Socket.IO setup for managing connections and events
io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  // Handle user login and set username
  socket.on("setUsername", (username) => {
    activeUsers.set(socket.id, username);
    io.emit("userList", Array.from(activeUsers.values())); // Update user list for all clients
  });

  // Handle private messages (sending and receiving)
  socket.on("privateMessage", (data) => {
    const { targetUsername, message } = data;
    const sender = activeUsers.get(socket.id);

    // Find the target socket ID based on the username
    const targetSocketId = [...activeUsers.entries()].find(
      ([, username]) => username === targetUsername
    )?.[0];

    if (targetSocketId) {
      // Emit the private message to the target user
      io.to(targetSocketId).emit("privateMessage", { sender, message });
      // Send back to the sender's own client
      socket.emit("privateMessage", { sender, message });
    } else {
      // If the target user isn't found, send an error message
      socket.emit("errorMessage", { error: "User not found" });
    }
  });

  // Handle video call requests (peer-to-peer call)
  socket.on("callUser", ({ targetSocketId }) => {
    const from = activeUsers.get(socket.id);
    io.to(targetSocketId).emit("privateCallRequest", { from, targetSocketId });
  });

  // Handle group video call requests
  socket.on("startGroupCall", (participants) => {
    participants.forEach((participant) => {
      const participantSocketId = [...activeUsers.entries()].find(
        ([, username]) => username === participant
      )?.[0];

      if (participantSocketId) {
        io.to(participantSocketId).emit("groupCallRequest", {
          from: socket.id,
          participants,
        });
      }
    });
  });

  // Handle disconnection of users
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    activeUsers.delete(socket.id); // Remove user from active list
    io.emit("userList", Array.from(activeUsers.values())); // Update user list for all clients
  });
});

// Server setup (use environment port or fallback to 3000)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
