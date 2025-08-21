import express from "express";
import { saveFarmerInfo, signupUser, loginUser, getFarmer, updateFarmer } from "../controller/UserController.js"

const router = express.Router();

router.post("/register-farmer", saveFarmerInfo);
router.post("/sign-up", signupUser)
router.post("/login", loginUser)
router.get('/farmer/:farmerId', getFarmer);
router.put('/farmer/:farmerId', updateFarmer);

export default router;
