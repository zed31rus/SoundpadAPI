import Soundpad from "soundpad.js";

const soundpad = new Soundpad({
    startSoundpadOnConnect: true
});

async function main() {
    try {
        console.log("Коннектимся к Soundpad...");
        await soundpad.connect();
        console.log("Подключились. Проверяем, жив ли Soundpad...");
        const isAlive = await soundpad.isAlive();
        console.log("Soundpad жив:", isAlive);
        if (!isAlive) {
            throw new Error("Soundpad не отвечает, проверь, запущен ли он и включён ли remote control");
        }
        console.log("Запрашиваем список звуков...");
        const response = await soundpad.sendQuery("GetSoundlist()");
        console.log("Сырой ответ от Soundpad:", response);
        console.log("Тип ответа:", typeof response);
        console.log("Длина ответа:", response.length);
        const soundList = await soundpad.getSoundListJSON();
        console.log("Список звуков:", soundList);
    } catch (error) {
        console.error("Ошибка:", error.message);
    } finally {
        soundpad.disconnect();
    }
}

main();