import Soundpad from "soundpad.js";
import EventEmitter from "events";
import deepEqual from "fast-deep-equal";

class PlaybackHistoryStore extends EventEmitter {
    constructor(startSoundpadOnConnect = true, autoReconnect = true, MAX_HISTORY_SIZE = 100) {
        super();
        this.MAX_HISTORY_SIZE = MAX_HISTORY_SIZE;

        this.soundList = [];
        this.soundListXML = null;
        this.history = [];

        this.current = {
            sound: null,
            status: "STOPPED",
            position: 0,
            positionmmss: "0:00",
            duration: 0,
            durationmmss: "0:00",
            percentage: 0
        };

        this.volume = 0;
        this._currentWatcher = null;

        this.soundpad = new Soundpad({
            startSoundpadOnConnect,
            autoReconnect
        });
    }

    async init() {
        await this.soundpad.connect();
        this.soundList = await this.soundpad.getSoundListJSON();
        this.soundListXML = await this.soundpad.getSoundlist();
        this.volume = await this.soundpad.getVolume();

        setInterval(() => this.updateSoundList(), 300000); // 5 минут
        setInterval(async () => {
            this.volume = await this.soundpad.getVolume();
            this.emit("volumeUpdated", this.volume);
        }, 1000);
    }

    async play(soundId) {
        await this.soundpad.playSound(soundId);

        if (this._currentWatcher) clearInterval(this._currentWatcher);

        this._currentWatcher = setInterval(async () => {
            const status = await this.soundpad.getPlayStatus();
            if (status == "STOPPED") {
                const stattus = await this.soundpad.getPlayStatus();
                    if (stattus == "STOPPED") {
                        await this.stop();
                        return;
                }
            }

            if (status !== "PLAYING" && status !== "PAUSED") return;

            const sound = this.soundList.find(s => s.index === Number(soundId));
            if (!sound) return;

            const rawDuration = sound.duration || "00:00";
            const durationMs = MMSSToMs(rawDuration);
            const positionMs = await this.soundpad.getPlaybackPosition() || 0;

            this.current = {
                sound,
                status,
                position: positionMs,
                positionmmss: msToMMSS(positionMs),
                duration: durationMs,
                durationmmss: rawDuration,
                percentage: (positionMs / durationMs) * 100
            };

            this.emit("currentUpdated", this.current);
        }, 700);
    }

    async stop() {
        clearInterval(this._currentWatcher);
        this._currentWatcher = null;
        await this.soundpad.stopSound();

        const sound = this.current.sound;
        if (sound && sound.index !== undefined) {
            if (!this.history[0] || this.history[0].index !== sound.index) {
                this.history.unshift(sound);
                if (this.history.length > this.MAX_HISTORY_SIZE) {
                    this.history.pop();
                }
                this.emit("historyUpdated", this.history);
            }
        }

        this.current = {
            sound: null,
            status: "STOPPED",
            position: 0,
            positionmmss: "0:00",
            duration: 0,
            durationmmss: "0:00",
            percentage: 0
        };

        this.emit("currentUpdated", this.current);
    }

    async getHistory() {
        return this.history;
    }

    async getCurrent() {
        return this.current;
    }

    async togglePause() {
        await this.soundpad.togglePause();
    }

    async getSoundListJSON() {
        return this.soundList;
    }

    async getSoundListXML() {
        return this.soundListXML;
    }

    async addSound(url) {
        const status = await this.soundpad.addSound(url);
        if (status) {
            await this.updateSoundList();
        }
    }

    async jump(percentage) {
        const jumpPosition = this.current.duration * (+percentage / 100);
        const jumpRelative = Math.floor(jumpPosition - this.current.position);
        await this.soundpad.jump(jumpRelative);
    }

    async updateSoundList() {
        const newList = await this.soundpad.getSoundListJSON();
        const newXML = await this.soundpad.getSoundlist();

        if (!deepEqual(this.soundList, newList)) {
            this.soundList = newList;
            this.emit("soundListUpdated", this.soundList);
        }

        if (!deepEqual(this.soundListXML, newXML)) {
            this.soundListXML = newXML;
            this.emit("soundListXMLUpdated", this.soundListXML);
        }
    }

    async setVolume(volume) {
        await this.soundpad.setVolume(volume);
        this.volume = await this.soundpad.getVolume();
        this.emit("volumeUpdated", this.volume);
    }

    async getVolume() {
        return this.volume;
    }
}

function msToMMSS(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(1, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
}

function MMSSToMs(mmss) {
    const [minutes, seconds] = mmss.split(":").map(Number);
    return (minutes * 60 + seconds) * 1000;
}

export default PlaybackHistoryStore;