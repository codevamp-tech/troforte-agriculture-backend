import express from 'express';
import { getAgricultureNews } from '../controller/newsController.js';

const router = express.Router();

router.get('/agriculture', getAgricultureNews);

export default router;