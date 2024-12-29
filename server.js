require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

// Initialize Express app and HTTP server
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// MongoDB setup
mongoose.connect('mongodb+srv://kraj:Champion1685@cluster0.o7g0j.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.log(err));

// MongoDB Schema for storing chat messages
const messageSchema = new mongoose.Schema({
  from: String,
  to: String,
  message: String,
  timestamp: Date
});

const Message = mongoose.model('Message', messageSchema);

// Static files (frontend assets)
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Handle new connections for real-time messaging
let users = {};

io.on('connection', (socket) => {
  console.log('User connected: ', socket.id);

  // Register user
  socket.on('register', (username) => {
    users[socket.id] = username;
    console.log(`${username} connected`);
  });

  // Private messaging
  socket.on('private_message', async (data) => {
    const { to, message, from } = data;
    io.to(to).emit('private_message', { from, message });

    // Save to MongoDB
    const newMessage = new Message({ from, to, message, timestamp: new Date() });
    await newMessage.save();
  });

  // Group chat (broadcast to everyone except sender)
  socket.on('group_message', (data) => {
    io.emit('group_message', data); // Broadcast to all connected users
  });

  // Handle disconnections
  socket.on('disconnect', () => {
    console.log('User disconnected: ', socket.id);
    delete users[socket.id];
  });
});

// Listen for HTTP requests
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
