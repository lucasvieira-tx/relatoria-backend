import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import uploadCreateHandler from './api/upload/create.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        message: 'RelatorIA Backend API is running',
        version: '1.0.0'
    });
});

// Upload create endpoint
app.post('/api/upload/create', async (req, res) => {
    try {
        await uploadCreateHandler(req, res);
    } catch (error) {
        console.error('Error in /api/upload/create:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`\n📍 Available endpoints:`);
    console.log(`   GET  / - Health check`);
    console.log(`   POST /api/upload/create - Create upload URL`);
});
