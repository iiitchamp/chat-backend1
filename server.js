const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const cors = require("cors");

// MongoDB connection
mongoose
  .connect("mongodb+srv://kraj:Champion1685@cluster0.o7g0j.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
});

const User = mongoose.model("User", userSchema);

// Express setup
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

// WebRTC group call participants and users
let groupCallParticipants = new Set();
let activeUsers = new Map();

// Socket.IO setup
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);
  activeUsers.set(socket.id, socket.id);  // Register user by socket id

  // Notify others when a user connects
  socket.broadcast.emit("userConnected", socket.id);
  io.emit("updateActiveUsers", Array.from(activeUsers.values()));

  // Handle chat messages (group and private)
  socket.on("sendMessage", (messageData) => {
    const { message, isPrivate, targetId } = messageData;
    if (isPrivate) {
      socket.to(targetId).emit("receiveMessage", { message, sender: socket.id });
    } else {
      io.emit("receiveMessage", { message, sender: socket.id });
    }
  });

  // Handle video call signaling (private)
  socket.on("callUser", (data) => {
    const { targetSocketId, offer } = data;
    io.to(targetSocketId).emit("incomingCall", { from: socket.id, offer });
  });

  socket.on("answerCall", (data) => {
    const { to, answer } = data;
    io.to(to).emit("callAnswered", { from: socket.id, answer });
  });

  socket.on("iceCandidate", (data) => {
    const { to, candidate } = data;
    io.to(to).emit("iceCandidate", { from: socket.id, candidate });
  });

  // Group video call signaling
  socket.on("joinGroupCall", () => {
    groupCallParticipants.add(socket.id);
    io.emit("groupCallParticipants", Array.from(groupCallParticipants));
  });

  socket.on("leaveGroupCall", () => {
    groupCallParticipants.delete(socket.id);
    io.emit("groupCallParticipants", Array.from(groupCallParticipants));
  });

  // Disconnect user
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    activeUsers.delete(socket.id);
    groupCallParticipants.delete(socket.id);
    io.emit("updateActiveUsers", Array.from(activeUsers.values()));
    io.emit("groupCallParticipants", Array.from(groupCallParticipants));
  });
});

// User Registration and Authentication
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).send("Username and password are required");

  const hashedPassword = await bcrypt.hash(password, 10);
  try {
    const newUser = new User({ username, password: hashedPassword });
    await newUser.save();
    res.status(201).send("User registered successfully");
  } catch (err) {
    res.status(400).send("Username already exists");
  }
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).send("Username and password are required");

  const user = await User.findOne({ username });
  if (!user) return res.status(404).send("User not found");

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) return res.status(401).send("Invalid password");

  res.status(200).send("Login successful");
});

app.listen(3000, () => console.log("Server running on port 3000"));
