const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const cors = require('cors');

// MongoDB connection
mongoose
  .connect('mongodb+srv://kraj:Champion1685@cluster0.o7g0j.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error:', err));

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
});

const User = mongoose.model('User', userSchema);

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

// Active users and WebRTC signaling
let activeUsers = [];
const peerConnections = {};

// Socket.io setup
io.on('connection', (socket) => {
  console.log('a user connected:', socket.id);

  // Register user with username
  socket.on('setUsername', (username) => {
    socket.username = username;
    activeUsers.push({ username, socketId: socket.id });

    // Emit the updated active users list to all clients
    io.emit('updateActiveUsers', activeUsers.map((user) => user.username));
  });

  // Private chat message handling
  socket.on('sendMessage', (data) => {
    if (data.isPrivate) {
      // Send private message to target user
      io.to(data.targetId).emit('receiveMessage', data);
    } else {
      // Send group message to everyone
      io.emit('receiveMessage', data);
    }
  });

  // WebRTC signaling for video calls
  socket.on('callUser', ({ targetUsername, offer }) => {
    const targetSocketId = activeUsers.find(
      (user) => user.username === targetUsername
    )?.socketId;
    if (targetSocketId) {
      io.to(targetSocketId).emit('receiveOffer', { offer, from: socket.id });
    }
  });

  socket.on('answerOffer', ({ answer, to }) => {
    io.to(to).emit('receiveAnswer', { answer, from: socket.id });
  });

  socket.on('sendIceCandidate', ({ candidate, to }) => {
    io.to(to).emit('receiveIceCandidate', { candidate, from: socket.id });
  });

  // Handle user disconnection
  socket.on('disconnect', () => {
    console.log('user disconnected:', socket.id);
    activeUsers = activeUsers.filter((user) => user.socketId !== socket.id);
    io.emit('updateActiveUsers', activeUsers.map((user) => user.username));
  });
});

// User Authentication Routes
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).send('Username and password are required');

  const hashedPassword = await bcrypt.hash(password, 10);
  try {
    const newUser = new User({ username, password: hashedPassword });
    await newUser.save();
    res.status(201).send('User registered successfully');
  } catch (err) {
    res.status(400).send('Username already exists');
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).send('Username and password are required');

  const user = await User.findOne({ username });
  if (!user) return res.status(404).send('User not found');

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) return res.status(401).send('Invalid password');

  res.status(200).send('Login successful');
});

// Default route
app.get('/', (req, res) => {
  res.send('Welcome to the Chat and Video Call Server!');
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
