import express from "express";
import dotenv from "dotenv";
// import bodyParser from "body-parser";
import ragRoutes from "./routes/ChatRoutes.js";
import uploadRoutes from "./routes/uploadFileRoutes.js";

dotenv.config();
const app = express();
// app.use(bodyParser.json());
app.use(express.json());

app.use("/api", uploadRoutes);

app.use("/uploads", express.static("uploads"));
app.use("/api", ragRoutes);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
