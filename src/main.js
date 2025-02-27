// app.js
'use strict';

import Koa from 'koa';
import Router from 'koa-router';
import bodyParser from 'koa-bodyparser';
import logger from 'koa-logger';
import json from 'koa-json';
import cors from '@koa/cors';

const app = new Koa();
const router = new Router();

// 미들웨어 설정
app.use(logger());
app.use(bodyParser());
app.use(json({ pretty: false, param: 'pretty' }));
app.use(cors());

// 에러 핸들링
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    ctx.status = err.status || 500;
    ctx.body = {
      status: 'error',
      message: err.message
    };
    ctx.app.emit('error', err, ctx);
  }
});

// 라우트 설정
router.get('/', async (ctx) => {
  ctx.body = {
    status: 'success',
    message: 'Koa API is running!'
  };
});

// API 라우트 예시
router.get('/api/users', async (ctx) => {
  ctx.body = {
    status: 'success',
    data: [
      { id: 1, name: '홍길동' },
      { id: 2, name: '김철수' }
    ]
  };
});

router.post('/api/users', async (ctx) => {
  const user = ctx.request.body;
  // 여기서 데이터베이스에 저장하는 로직 구현
  ctx.status = 201;
  ctx.body = {
    status: 'success',
    data: user
  };
});

// 라우터 미들웨어 적용
app.use(router.routes());
app.use(router.allowedMethods());

// 서버 시작
const PORT = process.env.PORT || 5500;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// 에러 이벤트 리스너
app.on('error', (err, ctx) => {
  console.error('서버 에러', err);
});

export default app;