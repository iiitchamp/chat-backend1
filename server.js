const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const cors = require("cors");

mongoose.connect("mongodb+srv://kraj:Champion1685@cluster0.o7g0j.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0", { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error("MongoDB connection error:", err));

const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
});

const User = mongoose.model("User", userSchema);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const activeUsers = new Map(); // Track active users

// Socket.IO setup
io.on("connection", socket => {
  console.log("A user connected:", socket.id);

  // Default guest username for new connections
  activeUsers.set(socket.id, `Guest-${socket.id.slice(0, 5)}`);
  io.emit("userList", Array.from(activeUsers.values()));

  socket.on("setUsername", username => {
    activeUsers.set(socket.id, username);
    io.emit("userList", Array.from(activeUsers.values())); // Emit updated list of active users
  });

  // Handle group chat message
  socket.on("groupMessage", message => {
    const sender = activeUsers.get(socket.id);
    io.emit("groupMessage", { sender, message });
  });

  // Handle private message
  socket.on("privateMessage", ({ targetUsername, message }) => {
    const sender = activeUsers.get(socket.id);
    const targetSocketId = [...activeUsers.entries()].find(([_, username]) => username === targetUsername)?.[0];

    if (targetSocketId) {
      io.to(targetSocketId).emit("privateMessage", { sender, message });
      socket.emit("privateMessage", { sender, message });
    } else {
      socket.emit("errorMessage", { error: "User not found" });
    }
  });

  // Handle call requests
  socket.on("callUser", ({ targetUsername }) => {
    const from = activeUsers.get(socket.id);
    const targetSocketId = [...activeUsers.entries()].find(([_, username]) => username === targetUsername)?.[0];
    if (targetSocketId) {
      io.to(targetSocketId).emit("privateCallRequest", { from, targetSocketId });
    }
  });

  // Handle call answers (accept/decline)
  socket.on("answerCall", ({ targetSocketId, answer }) => {
    if (answer === "accept") {
      io.to(targetSocketId).emit("callAccepted", { from: socket.id });
    } else {
      io.to(targetSocketId).emit("callDeclined", { from: socket.id });
    }
  });

  // Handle group call request
  socket.on("startGroupCall", participants => {
    participants.forEach(participant => {
      const participantSocketId = [...activeUsers.entries()].find(([_, username]) => username === participant)?.[0];
      if (participantSocketId) {
        io.to(participantSocketId).emit("groupCallRequest", { from: socket.id, participants });
      }
    });
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    activeUsers.delete(socket.id);
    io.emit("userList", Array.from(activeUsers.values()));
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
