import axios from 'axios';
import sqlite3 from 'sqlite3';

// SQLite 데이터베이스 연결
const db = new sqlite3.Database('./webtoons.db', (err) => {
    if (err) {
        console.error('Database connection error:', err);
    } else {
        console.log('Connected to SQLite database');
    }
});

// 테이블 생성 함수 (변경 없음)
function createTables() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run(`
                CREATE TABLE IF NOT EXISTS webtoons (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    webtoon_id TEXT UNIQUE,
                    title TEXT NOT NULL,
                    about TEXT,
                    genre TEXT,
                    age TEXT,
                    thumb_url TEXT,
                    thumb_blob BLOB,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
            db.run(`
                CREATE TABLE IF NOT EXISTS episodes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    webtoon_id TEXT,
                    episode_id TEXT,
                    thumb_url TEXT,
                    thumb_blob BLOB,
                    title TEXT,
                    rating TEXT,
                    date TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (webtoon_id) REFERENCES webtoons(webtoon_id)
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    });
}

// 웹툰 상세 정보 삽입/업데이트 함수 (변경 없음)
async function upsertWebtoon(webtoon, webtoon_simple, webtoonId) {
    let thumbBlob = null;
    if (webtoon_simple.thumb) {
        try {
            const imageResponse = await axios.get(webtoon_simple.thumb, {
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Referer': 'https://webtoon-site.com'
                }
            });
            thumbBlob = Buffer.from(imageResponse.data);
        } catch (error) {
            console.error(`Failed to fetch thumbnail for ${webtoon_simple.thumb}:`, error.response?.status, error.message);
        }
    }

    return new Promise((resolve, reject) => {
        db.run(`
            INSERT INTO webtoons (webtoon_id, title, about, genre, age, thumb_url, thumb_blob)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(webtoon_id) DO UPDATE SET
                title = excluded.title,
                about = excluded.about,
                genre = excluded.genre,
                age = excluded.age,
                thumb_url = excluded.thumb_url,
                thumb_blob = excluded.thumb_blob
        `, [
            webtoonId,
            webtoon.title,
            webtoon.about,
            webtoon.genre,
            webtoon.age,
            webtoon_simple.thumb,
            thumbBlob
        ], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

// 에피소드 삽입 함수 (변경 없음)
async function insertEpisode(episode, webtoonId) {
    let thumbBlob = null;
    if (episode.thumb) {
        try {
            const imageResponse = await axios.get(episode.thumb, {
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Referer': 'https://webtoon-site.com'
                }
            });
            thumbBlob = Buffer.from(imageResponse.data);
        } catch (error) {
            console.error(`Failed to fetch thumbnail for ${episode.thumb}:`, error.response?.status, error.message);
        }
    }

    return new Promise((resolve, reject) => {
        db.run(`
            INSERT INTO episodes (webtoon_id, episode_id, thumb_url, thumb_blob, title, rating, date)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            webtoonId,
            episode.id,
            episode.thumb,
            thumbBlob,
            episode.title,
            episode.rating,
            episode.date
        ], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

// 배열을 지정된 크기로 나누는 헬퍼 함수
function chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
}

// 메인 실행 함수
async function fetchAndSaveWebtoons() {
    try {
        // 테이블 생성
        await createTables();

        // 오늘의 웹툰 목록 가져오기
        const todayResponse = await axios.get('https://webtoon-crawler.nomadcoders.workers.dev/today');
        const webtoons = todayResponse.data;

        const totalWebtoons = webtoons.length;
        let currentWebtoon = 0;

        // 각 웹툰의 상세 정보와 에피소드 가져오기
        for (const webtoon of webtoons) {
            currentWebtoon++;
            const webtoonProgress = ((currentWebtoon / totalWebtoons) * 100).toFixed(2);
            process.stdout.write(`\rProcessing webtoon ${currentWebtoon}/${totalWebtoons} (${webtoonProgress}%)`);

            const webtoonId = webtoon.id || webtoon.url.split('/').pop();

            try {
                // 상세 정보 가져오고 삽입
                const detailResponse = await axios.get(`https://webtoon-crawler.nomadcoders.workers.dev/${webtoonId}`);
                const detailData = detailResponse.data;
                await upsertWebtoon(detailData, webtoon, webtoonId);

                // 에피소드 정보 가져오기
                const episodesResponse = await axios.get(`https://webtoon-crawler.nomadcoders.workers.dev/${webtoonId}/episodes`);
                const episodes = episodesResponse.data;

                const totalEpisodes = episodes.length;
                let processedEpisodes = 0;

                // 에피소드를 5개씩 묶어서 병렬 처리
                const episodeChunks = chunkArray(episodes, 5);
                for (const chunk of episodeChunks) {
                    const episodePromises = chunk.map(async (episode) => {
                        try {
                            await insertEpisode(episode, webtoonId);
                        } catch (episodeError) {
                            console.error(`\nError inserting episode ${episode.id} for webtoon ID ${webtoonId}:`, episodeError.message);
                        }
                    });

                    await Promise.all(episodePromises);
                    processedEpisodes += chunk.length;
                    const episodeProgress = ((processedEpisodes / totalEpisodes) * 100).toFixed(2);
                    process.stdout.write(`\rProcessing webtoon ${currentWebtoon}/${totalWebtoons} (${webtoonProgress}%) - Episodes: ${processedEpisodes}/${totalEpisodes} (${episodeProgress}%)`);
                }
            } catch (webtoonError) {
                console.error(`\nError processing webtoon ID ${webtoonId}:`, webtoonError.message);
            }
        }
        console.log('\nAll webtoons processed successfully');
    } catch (error) {
        console.error('\nError in fetchAndSaveWebtoons:', error.message);
    } finally {
        db.close((err) => {
            if (err) {
                console.error('Error closing database:', err);
            } else {
                console.log('Database connection closed');
            }
        });
    }
}

// 스크립트 실행
fetchAndSaveWebtoons();