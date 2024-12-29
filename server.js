const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const cors = require("cors");

mongoose
  .connect("mongodb+srv://kraj:Champion1685@cluster0.o7g0j.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// User schema
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

const activeUsers = new Map(); // Track active users
const privateChats = new Map(); // Store private chat history

// Socket.IO setup
io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  // Set anonymous username
  activeUsers.set(socket.id, `Guest-${socket.id.slice(0, 5)}`);
  io.emit("userList", Array.from(activeUsers.values()));

  // Handle private message
  socket.on("privateMessage", (data) => {
    const { targetUsername, message } = data;
    const sender = activeUsers.get(socket.id);
    const targetSocketId = [...activeUsers.entries()].find(
      ([, username]) => username === targetUsername
    )?.[0];

    if (targetSocketId) {
      io.to(targetSocketId).emit("privateMessage", { sender, message });
      socket.emit("privateMessage", { sender, message });

      // Save the private chat history for this user pair
      const chatKey = [sender, targetUsername].sort().join('-');
      if (!privateChats.has(chatKey)) {
        privateChats.set(chatKey, []);
      }
      privateChats.get(chatKey).push({ sender, message });
    } else {
      socket.emit("errorMessage", { error: "User not found" });
    }
  });

  // Private call request (One-to-one)
  socket.on("callUser", ({ targetSocketId }) => {
    const from = activeUsers.get(socket.id);
    io.to(targetSocketId).emit("privateCallRequest", { from, targetSocketId });
  });

  // Answer call (Accept or decline private call)
  socket.on("answerCall", ({ targetSocketId, answer }) => {
    if (answer === "accept") {
      io.to(targetSocketId).emit("callAccepted", { from: socket.id });
    } else {
      io.to(targetSocketId).emit("callDeclined", { from: socket.id });
    }
  });

  // Group call request (Multiple users)
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

  // Handle user disconnect
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    activeUsers.delete(socket.id);
    io.emit("userList", Array.from(activeUsers.values()));
  });
});

// User registration and login routes
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).send("Username and password are required");

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
  if (!username || !password)
    return res.status(400).send("Username and password are required");

  const user = await User.findOne({ username });
  if (!user) return res.status(404).send("User not found");

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) return res.status(401).send("Invalid password");

  res.status(200).send("Login successful");
});

// Default route
app.get("/", (req, res) => {
  res.send("Welcome to the Chat and Video Call Server!");
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
