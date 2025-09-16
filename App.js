import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io'
import PlaybackHistoryStore from './playbackHistoryStore.js';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const server = http.createServer(app);
const PORT = 3002
const plHStore = new PlaybackHistoryStore(true, true, 100);
await plHStore.init();

const soundStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'sounds/')
    },
    filename: (req, file, cb) => {
        const uniqueName = file.originalname;
        cb(null, uniqueName)
    }
})
const uploadSound = multer({ storage: soundStorage });

const corsOptions =  {origin:
    ["https://zed31rus.ru", "http://127.0.0.1:3000"], credentials: true};

app.use(express.json());
app.use(cors(corsOptions));

const ios = new Server(server, {
  cors: corsOptions
});

server.listen(PORT, (error) => {
    error ? console.log(error) : console.log(`OK, port: ${PORT}`);
});

ios.on('connection', async (socket) => {
    console.log('New Socket.IO connection established');

    const current = await plHStore.getCurrent();
    const history = await plHStore.getHistory();
    const soundList = await plHStore.getSoundListJSON();
    const volume = await plHStore.getVolume();

    socket.emit('currentUpdated', current);
    socket.emit('historyUpdated', history);
    socket.emit('soundListUpdated', soundList);
    socket.emit('volumeUpdated', volume);
});

plHStore.on('currentUpdated', (current) => {
    ios.emit('currentUpdated', current);
});

plHStore.on('historyUpdated', (history) => {
    ios.emit('historyUpdated', history);
});

plHStore.on('soundListUpdated', (soundList) => {
    ios.emit('soundListUpdated', soundList);
});

plHStore.on('volumeUpdated', (volume) => {
    ios.emit('volumeUpdated', volume);
});

app.post('/soundpad/getSoundListJSON', async (req, res) => {
    try {
        const soundListJSON = await plHStore.getSoundListJSON();
        res.status(200).json({status: true, data: soundListJSON, message: "Sound list fetched successfully"});
    } catch (error) {
        console.error('Error fetching sound list:', error);
        res.status(500).json({status: false, message: "Failed to fetch JSON sound list"});
    }
});

app.post('/soundpad/getSoundListXML', async (req, res) => {
    try {
        const soundListXML = await plHStore.getSoundListXML();
        res.type('application/xml').send(soundListXML);
    } catch (error) {
        console.error('Error fetching sound list:', error);
        res.status(500).json({status: false, message: "Failed to fetch XML sound list"});
    }
});

app.post('/soundpad/playSound', async (req, res) => {
    const soundId = req.body.soundId;
    try {
        await plHStore.play(soundId);

        res.status(200).json({status: true, message: "Sound played successfully"});
    } catch (error) {
        console.error('Error playing sound:', error);
        res.status(500).json({status: false, message: "Failed to play sound"});
    }
});

app.post('/soundpad/stopSound', async (req, res) => {
    try {
        await plHStore.stop();
        res.status(200).json({status: true, message: "Sound stopped successfully"});
    } catch (error) {
        console.error('Error stopping sound:', error);
        res.status(500).json({status: false, message: "Failed to stop sound"});
    }
});

app.post('/soundpad/pauseSound', async (req, res) => {
    try {
        await plHStore.togglePause();
        res.status(200).json({status: true, message: "Sound paused successfully"});
    } catch (error) {
        console.error('Error pausing sound:', error);
        res.status(500).json({status: false, message: "Failed to pause sound"});
    }
});

app.post('/soundpad/jump', async (req, res) => {
    const percentage = req.body.percentage;
    try {
        await plHStore.jump(percentage);
        res.status(200).json({status: true, message: "Jumped to truck position successfully"});
    } catch (error) {
        console.error('Error jumping to track position:', error);
        res.status(500).json({status: false, message: "Failed to jump to position"});
    }
});

app.post('/soundpad/setVolume', async (req, res) => {
    const volume = req.body.volume;
    try {
        await plHStore.setVolume(volume);
        res.status(200).json({status: true, message: "Volume set successfully"});
    } catch (error) {
        console.error('Error setting volume:', error);
        res.status(500).json({status: false, message: "Failed to set volume"});
    }
});

app.post('/soundpad/getVolume', async (req, res) => {
    try {
        const volume = await plHStore.getVolume();
        res.status(200).json({status: true, data:volume, message: "Volume fetched successfully"});
    } catch (error) {
        console.error('Error fetching volume:', error);
        res.status(500).json({status: false, message: "Failed to fetch volume"});
    }
});

app.post("/soundpad/addSound", authMiddleware({isCheckedByAdmin: true}), uploadSound.array('files'), async (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({
            status: false,
            message: "Error uploading files"
        });
    }

    try {
        const addedSounds = [];
        
        for (const file of req.files) {
            const fullPath = path.join(__dirname, 'sounds', file.filename);
            await plHStore.addSound(fullPath);
            addedSounds.push({
                name: file.originalname
            });
        }

        res.status(200).json({
            status: true,
            message: "Files uploaded and added to Soundpad successfully",
            data: addedSounds
        });

    } catch (err) {
        console.error("Error adding sounds:", err);
        res.status(500).json({
            status: false,
            message: "Failed to add sounds"
        });
    }
});

function authMiddleware(options = {}) {
    return async (req, res, next) => {
        const cookies = req.headers.cookies;
        if (!cookies) return res.status(401).json({ status: false, message: "No cookies" });

        try {
            const authRes = await fetch("https://auth.zed31rus.ru/me", {
                headers: { "Cookie": cookies }
            });

            const data = await authRes.json();

            if (!data.status) return res.status(401).json({ status: false, message: "Unauthorized" });

            req.user = data.user;

            if (options.isCheckedByAdmin && !req.user.isCheckedByAdmin) {
                return res.status(403).json({ status: false, message: "User not verified by admin" });
            }

            next();
        } catch (err) {
            console.error(err);
            return res.status(500).json({ status: false, message: "Auth check failed" });
        }
    };
}