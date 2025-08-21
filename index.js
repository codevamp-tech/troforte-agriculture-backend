import express from "express";
import dotenv from "dotenv";
// import bodyParser from "body-parser";
import ragRoutes from "./routes/ChatRoutes.js";
import uploadRoutes from "./routes/uploadFileRoutes.js";
import plantHealthRoutes from "./routes/plantHealthRoutes.js"
import newsRoutes from "./routes/newsRoutes.js"
import userRoutes from "./routes/UserRoutes.js"

dotenv.config();
const app = express();
// app.use(bodyParser.json());
app.use(express.json());
app.use(express.urlencoded({ extended: true, limit: '50mb' }));


app.use("/api", uploadRoutes);
app.use("/api", plantHealthRoutes);
app.use("/uploads", express.static("uploads"));
app.use("/api", ragRoutes);
app.use('/api/news', newsRoutes)
app.use('/api', userRoutes)

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
