const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");

const authRoutes = require('./routes/auth');
const chatRoutes = require("./routes/chat");

const app = express();

// Middlewares primeiro
app.use(cors());
app.use(bodyParser.json());

// Depois as rotas
app.use('/auth', authRoutes);
app.use("/chat", chatRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
