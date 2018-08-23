const express = require('express');
const path = require('path');

const app = express();
app.use(express.static(path.join(__dirname, 'html')));

/*개별 인터뷰 페이지*/
app.get('/interviews/:id', (req, res)=>{

});

/* 메인 페이지(HOP 간단 소개 + 모든 인터뷰 사진 리스트)*/
app.get('/', (req, res)=>{
    res.sendFile(path.join(__dirname, 'html', 'index.html'));
});

/* HOP 소개 페이지 */
app.get('/team', (req, res)=>{

});

/* 관리자용 로그인 페이지 */
app.get('/login', (req, res)=>{

});

/* 관리자용 페이지: 추가, 수정, 삭제 */
app.get('/admin', (req, res)=>{

});


app.listen(80, ()=>{
    console.log('Connected: 80 port');
});