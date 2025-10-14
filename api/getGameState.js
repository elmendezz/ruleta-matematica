export default async function handler(request, response) {
    const GIST_ID = process.env.GIST_ID;
    const GIST_FILENAME = 'gamestate.json';

    if (!GIST_ID) {
        // Si no hay Gist, devuelve un estado inicial para que la UI no falle.
        return response.status(200).json({
            participants: [],
            gameState: { status: 'waiting' }
        });
    }

    try {
        const gistUrl = `https://api.github.com/gists/${GIST_ID}`;
        const gistResponse = await fetch(gistUrl);

        if (!gistResponse.ok) {
            throw new Error(`Failed to fetch Gist: ${gistResponse.statusText}`);
        }

        const gistData = await gistResponse.json();
        const fileContent = gistData.files[GIST_FILENAME]?.content;

        if (!fileContent) {
            throw new Error(`File ${GIST_FILENAME} not found in Gist.`);
        }

        const gameState = JSON.parse(fileContent);

        // Enviar el estado del juego con cabeceras para evitar el caché del navegador
        response.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        response.setHeader('Pragma', 'no-cache');
        response.setHeader('Expires', '0');
        response.status(200).json(gameState);

    } catch (error) {
        console.error('Error fetching game state from Gist:', error);
        response.status(500).json({ message: 'Error fetching game state', error: error.message });
    }
}