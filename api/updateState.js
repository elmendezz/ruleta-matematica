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
    let GIST_ID = process.env.GIST_ID; // El ID del Gist que contiene el estado
    const GIST_FILENAME = 'gamestate.json';
    
    // Inicializar el cliente de Google AI
    const genAI = new GoogleGenerativeAI(GCP_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    try {
        // Si no hay GIST_ID, crea uno y lo muestra en los logs.
        if (!GIST_ID) {
            console.log('GIST_ID not set. Creating a new Gist...');
            const initialContent = JSON.stringify({
                participants: [],
                gameState: { status: 'waiting' }
            }, null, 2);

            const createGistResponse = await fetch('https://api.github.com/gists', {
                method: 'POST',
                headers: {
                    'Authorization': `token ${GITHUB_TOKEN}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/vnd.github.v3+json'
                },
                body: JSON.stringify({
                    description: "Ruleta Matemática Game State",
                    public: false,
                    files: { [GIST_FILENAME]: { content: initialContent } }
                })
            });

            if (!createGistResponse.ok) throw new Error('Failed to create Gist.');
            
            const newGist = await createGistResponse.json();
            GIST_ID = newGist.id;
            console.log('--------------------------------------------------------------------');
            console.log(`🚀 New Gist created! Add this to your Vercel environment variables:\n   GIST_ID=${GIST_ID}`);
            console.log('--------------------------------------------------------------------');
        }

        let gameState = request.body;
        const action = gameState.action; // La acción que envía el admin.html

        // Si la acción es finalizar o reiniciar, no necesitamos a la IA
        if (action === 'endGame' || action === 'reset' || action === 'updateParticipants') {
            // Simplemente se procederá a guardar el estado modificado
        }

        // --- LÓGICA DE IA ---
        if (action === 'startGame') {
            // Si las categorías no vienen definidas manualmente, se generan con la IA.
            if (!gameState.rouletteCategories || gameState.rouletteCategories.length === 0) {
                const topic = gameState.topic;
                const prompt = `Genera un array JSON con 5 categorías de cálculo mental para una ruleta sobre el tema: "${topic}". El formato debe ser un array de strings, por ejemplo: ["Sumas", "Restas", "Multiplicación"].`;
                const result = await model.generateContent(prompt);
                const text = result.response.text();
                // Limpiar la respuesta de la IA para obtener solo el JSON
                const categories = JSON.parse(text.match(/\[.*?\]/s)[0]);
                gameState.rouletteCategories = categories;
            }
            gameState.colors = ['#4a90e2', '#50e3c2', '#f5a623', '#bd10e0', '#9013fe', '#e74c3c'];
        }

        if (action === 'generateQuestion') {
            const selectedQuestion = gameState.category; // 'category' ahora contiene la pregunta seleccionada

            // Si hay entradas manuales, busca la respuesta correspondiente
            if (gameState.manualEntries && gameState.manualEntries.length > 0) {
                const entry = gameState.manualEntries.find(e => e.question === selectedQuestion);
                if (entry) {
                    gameState.currentQuestion = `${entry.question}\n(Respuesta: ${entry.answer})`;
                } else {
                    gameState.currentQuestion = selectedQuestion; // Si no encuentra respuesta, muestra solo la pregunta
                }
            } else {
                // Si no hay entradas manuales, usa la IA como antes
                const prompt = `Genera una pregunta de cálculo mental muy corta y simple para un niño de primaria sobre la categoría: "${selectedQuestion}". Responde únicamente con la pregunta en formato de string.`;
                const result = await model.generateContent(prompt);
                gameState.currentQuestion = result.response.text().trim();
            }
        }

        delete gameState.action; // Limpiar la acción antes de guardar
        delete gameState.category; // Limpiar la categoría antes de guardar
        
        // --- LÓGICA DE GITHUB GIST ---
        const gistApiUrl = `https://api.github.com/gists/${GIST_ID}`;
        const content = JSON.stringify(gameState, null, 2);
        
        // Enviar la actualización al Gist
        const commitResponse = await fetch(gistApiUrl, {
            method: 'PATCH',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Content-Type': 'application/json',
                'Accept': 'application/vnd.github.v3+json'
            },
            body: JSON.stringify({
                description: `Ruleta Game State - Last update: ${new Date().toISOString()}`,
                files: { [GIST_FILENAME]: { content: content } }
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