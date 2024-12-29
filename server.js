const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');

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

// MongoDB connection setup
mongoose.connect("mongodb+srv://kraj:Champion1685@cluster0.o7g0j.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.log('Error connecting to MongoDB:', err));

// Mongoose Models

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
  socketId: { type: String, required: true },
});

const User = mongoose.model('User', userSchema);

// Message Schema
const messageSchema = new mongoose.Schema({
  from: { type: String, required: true },
  to: { type: String, required: true }, // 'group' or specific username
  message: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

const Message = mongoose.model('Message', messageSchema);

// Active users array
let activeUsers = [];

// WebRTC peer connections
let peerConnections = {};

// Socket.io setup
io.on('connection', (socket) => {
  console.log('a user connected:', socket.id);

  // Assign a unique anonymous username to the user
  const username = `User${Math.floor(Math.random() * 10000)}`;
  socket.username = username;

  // Create a new user in the database or update if exists
  const newUser = new User({ username, socketId: socket.id });
  newUser.save()
    .then(() => console.log(`User ${username} saved to database`))
    .catch(err => console.log(`Error saving user: ${err}`));

  activeUsers.push({ username, socketId: socket.id });

  // Broadcast "User joined" message to all
  io.emit('receiveMessage', { message: `${username} has joined the chat.`, from: 'system', isPrivate: false });
  io.emit('updateActiveUsers', activeUsers.map((user) => user.username));

  // Handle sending messages
  socket.on('sendMessage', async (data) => {
    const { message, isPrivate, targetId } = data;

    // Save message to the database
    const newMessage = new Message({
      from: socket.username,
      to: isPrivate ? targetId : 'group',
      message: message,
    });

    await newMessage.save();

    if (isPrivate) {
      // Send private message to the target user
      io.to(targetId).emit('receiveMessage', { message, from: socket.username, isPrivate: true });
    } else {
      // Send group message to everyone
      io.emit('receiveMessage', { message, from: socket.username, isPrivate: false });
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
  socket.on('disconnect', async () => {
    console.log('user disconnected:', socket.id);

    // Remove user from the activeUsers array and database
    activeUsers = activeUsers.filter((user) => user.socketId !== socket.id);
    await User.deleteOne({ socketId: socket.id });

    io.emit('updateActiveUsers', activeUsers.map((user) => user.username));

    // Broadcast "User left" message
    if (socket.username) {
      io.emit('receiveMessage', { message: `${socket.username} has left the chat.`, from: 'system', isPrivate: false });
    }
  });
});

// Default route
app.get('/', (req, res) => {
  res.send('Welcome to the Chat and Video Call Server!');
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
