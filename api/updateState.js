// Importa el SDK de Google Generative AI
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Handler principal de Vercel para la función serverless
export default async function handler(request, response) {
    // Solo permitir peticiones POST
    if (request.method !== 'POST') {
        return response.status(405).json({ message: 'Method Not Allowed' });
    }

    // Obtener las claves secretas y configuración desde las Variables de Entorno de Vercel
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const GCP_API_KEY = process.env.GCP_API_KEY;
    const REPO = process.env.GITHUB_REPO; // ej: 'tu-usuario/nombre-del-repo'
    const FILE_PATH = 'public/gamestate.json';

    // Inicializar el cliente de Google AI
    const genAI = new GoogleGenerativeAI(GCP_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    try {
        let gameState = request.body;
        const action = gameState.action; // La acción que envía el admin.html

        // --- LÓGICA DE IA ---
        if (action === 'startGame') {
            const topic = gameState.topic;
            const prompt = `Genera un array JSON con 5 categorías de cálculo mental para una ruleta sobre el tema: "${topic}". El formato debe ser un array de strings, por ejemplo: ["Sumas", "Restas", "Multiplicación"].`;
            const result = await model.generateContent(prompt);
            const text = result.response.text();
            // Limpiar la respuesta de la IA para obtener solo el JSON
            const categories = JSON.parse(text.match(/\[.*?\]/s)[0]);
            gameState.rouletteCategories = categories;
            gameState.colors = ['#4a90e2', '#50e3c2', '#f5a623', '#bd10e0', '#9013fe', '#e74c3c'];
        }

        if (action === 'generateQuestion') {
            const category = gameState.category;
            const prompt = `Genera una pregunta de cálculo mental muy corta y simple para un niño de primaria sobre la categoría: "${category}". Responde únicamente con la pregunta en formato de string.`;
            const result = await model.generateContent(prompt);
            gameState.currentQuestion = result.response.text().trim();
        }

        delete gameState.action; // Limpiar la acción antes de guardar
        delete gameState.category; // Limpiar la categoría antes de guardar

        // --- LÓGICA DE GITHUB ---
        const githubApiUrl = `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`;

        // 1. Obtener el SHA actual del archivo (necesario para actualizar)
        const currentFile = await fetch(githubApiUrl, {
            headers: { 'Authorization': `token ${GITHUB_TOKEN}` }
        }).then(res => res.json());

        // 2. Preparar el contenido para la API de GitHub
        const content = Buffer.from(JSON.stringify(gameState, null, 2)).toString('base64');

        // 3. Enviar la actualización a GitHub
        const commitResponse = await fetch(githubApiUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: `[BOT] Update game state: ${new Date().toISOString()}`,
                content: content,
                sha: currentFile.sha, // Muy importante incluir el SHA
            }),
        });

        if (!commitResponse.ok) {
            throw new Error(`GitHub API error: ${commitResponse.statusText}`);
        }

        response.status(200).json({ success: true, message: 'Game state updated' });

    } catch (error) {
        console.error(error);
        response.status(500).json({ success: false, message: 'Internal Server Error', error: error.message });
    }
}