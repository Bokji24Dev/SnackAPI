import Koa from 'koa';
import Router from '@koa/router';
import sqlite3 from 'sqlite3';
import { promisify } from 'util';

const app = new Koa();
const router = new Router();
const port = 5500;

// SQLite 데이터베이스 연결
const db = new sqlite3.Database('./webtoons.db');
const dbAll = promisify(db.all.bind(db));
const dbGet = promisify(db.get.bind(db));

// GET /today - 오늘의 웹툰 목록
router.get('/today', async (ctx) => {
  try {
    const webtoons = await dbAll(`
      SELECT webtoon_id, title, thumb_url 
      FROM webtoons
    `);
    
    const result = webtoons.map(webtoon => ({
      id: webtoon.webtoon_id,
      title: webtoon.title,
      thumb: `http://10.159.30.55:5500/${webtoon.webtoon_id}/blob`
    }));
    
    ctx.body = result;
  } catch (error) {
    ctx.status = 500;
    ctx.body = { error: 'Internal Server Error' };
  }
});

// GET /:id - 특정 웹툰 상세 정보
router.get('/:id', async (ctx) => {
  try {
    const webtoon = await dbGet(`
      SELECT title, about, genre, age 
      FROM webtoons 
      WHERE webtoon_id = ?
    `, [ctx.params.id]);
    
    if (!webtoon) {
      ctx.status = 404;
      ctx.body = { error: 'Webtoon not found' };
      return;
    }
    
    ctx.body = webtoon;
  } catch (error) {
    ctx.status = 500;
    ctx.body = { error: 'Internal Server Error' };
  }
});

// GET /:id/episodes - 특정 웹툰의 에피소드 목록
router.get('/:id/episodes', async (ctx) => {
  try {
    const episodes = await dbAll(`
      SELECT id, title, rating, date 
      FROM episodes 
      WHERE webtoon_id = ?
    `, [ctx.params.id]);
    
    ctx.body = episodes.map(episode => ({
      id: episode.id.toString(),
      title: episode.title,
      rating: episode.rating,
      date: episode.date
    }));
  } catch (error) {
    ctx.status = 500;
    ctx.body = { error: 'Internal Server Error' };
  }
});

// GET /:webtoon_id/blob - 썸네일 이미지 반환
router.get('/:webtoon_id/blob', async (ctx) => {
  try {
    const webtoon = await dbGet(`
      SELECT thumb_blob 
      FROM webtoons 
      WHERE webtoon_id = ?
    `, [ctx.params.webtoon_id]);
    
    if (!webtoon || !webtoon.thumb_blob) {
      ctx.status = 404;
      ctx.body = { error: 'Thumbnail not found' };
      return;
    }
    
    ctx.type = 'image/jpeg'; // 또는 실제 이미지 타입에 맞게 설정
    ctx.body = Buffer.from(webtoon.thumb_blob);
  } catch (error) {
    ctx.status = 500;
    ctx.body = { error: 'Internal Server Error' };
  }
});


// GET /:webtoon_id/episodes/:id - 썸네일 이미지 반환
router.get('/:webtoon_id/episodes/:id', async (ctx) => {
  try {
    const webtoon = await dbGet(`
      SELECT thumb_blob 
      FROM episodes 
      WHERE webtoon_id = ? AND id = ?
    `, [ctx.params.webtoon_id, ctx.params.id]);
    
    if (!webtoon || !webtoon.thumb_blob) {
      ctx.status = 404;
      ctx.body = { error: 'Thumbnail not found' };
      return;
    }
    
    ctx.type = 'image/jpeg'; // 또는 실제 이미지 타입에 맞게 설정
    ctx.body = Buffer.from(webtoon.thumb_blob);
  } catch (error) {
    ctx.status = 500;
    ctx.body = { error: 'Internal Server Error' };
  }
});


// 미들웨어 설정
app.use(router.routes());
app.use(router.allowedMethods());

// 서버 시작
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// 프로세스 종료 시 DB 연결 해제
process.on('SIGINT', () => {
  db.close(() => {
    console.log('Database connection closed');
    process.exit(0);
  });
});