export async function generateCard(backgroundUrl, topArtists, topTracks, topGenre, appName = 'recapped', appUrl = 'recapped.app') {
    const W = 1080;
    const H = 1920;

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    await drawImage(ctx, backgroundUrl, 0, 0, W, H);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(0, 0, W, H);

    await drawImage(ctx, topArtists[0].images[0].url, 190, 80, 700, 700);

    drawText(ctx, W, topArtists, topTracks, topGenre, appName, appUrl);

    return canvas;
}

async function drawImage(ctx, url, x, y, w, h) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            ctx.drawImage(img, x, y, w, h);
            resolve();
        };
        img.onerror = (e) => {
            console.error('Failed to load image:', url, e);
            reject(e);
        };
        img.src = url;
    });
}

function drawText(ctx, W, topArtists, topTracks, topGenre, appName, appUrl) {
    const col1 = 80;
    const col2 = W / 2 + 40;

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 64px Helvetica Neue, Helvetica, Arial, sans-serif';
    ctx.fillText('Top Artists', col1, 880);
    ctx.fillText('Top Songs', col2, 880);

    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(col1, 910);
    ctx.lineTo(W - 80, 910);
    ctx.stroke();

    ctx.font = '44px Helvetica Neue, Helvetica, Arial, sans-serif';
    topArtists.slice(0, 5).forEach((artist, i) => {
        const name = artist.name.length > 16 ? artist.name.slice(0, 16) + '…' : artist.name;
        ctx.fillText(`${i + 1}.  ${name}`, col1, 980 + i * 80);
    });

    topTracks.slice(0, 5).forEach((track, i) => {
        const name = track.name.length > 16 ? track.name.slice(0, 16) + '…' : track.name;
        ctx.fillText(`${i + 1}.  ${name}`, col2, 980 + i * 80);
    });

    ctx.beginPath();
    ctx.moveTo(col1, 1390);
    ctx.lineTo(W - 80, 1390);
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 56px Helvetica Neue, Helvetica, Arial, sans-serif';
    ctx.fillText('Top Genre', col1, 1470);
    ctx.font = 'bold 100px Helvetica Neue, Helvetica, Arial, sans-serif';
    ctx.fillText(topGenre.toUpperCase(), col1, 1590);

    ctx.font = '40px Helvetica Neue, Helvetica, Arial, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(appName, col1, 1820);
    ctx.font = '36px Helvetica Neue, Helvetica, Arial, sans-serif';
    ctx.fillText(appUrl, col1, 1870);
}