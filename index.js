const express = require('express');
const bodyParser = require('body-parser');

const session = require('express-session');
const bkdf2Password = require('pbkdf2-password');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;

const Sequelize = require('sequelize');

const AWS = require('aws-sdk');
const formidable = require('formidable');  // 파일 업로드 모듈

const app = express();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(session({
    secret: 'gmlckddlWkd%(%(',
    resave: false,
    saveUninitialized: true
})); 
app.use(passport.initialize());  // passport 초기화
app.use(passport.session());  // (session 초기화 뒤쪽에 위치해야 함)

app.set('views', './templete');
app.set('view engine', 'pug');

/* 비밀번호 암호화 */
const hasher = bkdf2Password();
const admin = [  // id: admin / pw: 관리자1013
    {
        username: 'admin',
        password: 'EOs67hjIwAsjmT7ZMbEgVbPODyF19JR0D98StxdXhNwf2OcsTQPNcZEnM+bhU1+Wp91g1+sMFcxbL98xiAetbg3TT4kdwO3afMhUBSphZwxWI6xzWddWEJ2fQuq6M5J13zX3ifqZPZcWeyX9YxI8jMQ78v/ZIRRXLPjlWGO7AYw=',
        salt: 'jnvw2KXcNDdD0S+AoSUrc614FQrD0HfNYraHf/2Z7RAMXEMW5P69Iz49vKxSkSi6wF4C6pO4Z+TwCgO0zfDEnA==',
        displayname: 'admin'
    }
]

/* RDS sequelize 설정 */
const sequelize = new Sequelize(  // 나중에 인증 정보를 symbol based operator로 바꾸자
    'o2',  // RDS 데이터베이스 이름
    'heech1013',  // 유저 명(RDS:master id)
    'gml3413rds', // 비밀번호(RDS:matser pw)
    {
        'host': 'human-of-psyche.cuhu0wiij8n2.ap-northeast-2.rds.amazonaws.com',  // 데이터베이스 호스트(RDS:endpoint)
        'port': 3306,
        'dialect': 'mysql'  // 사용할 데이터베이스 종류  
    }
);

/* RDS(mysql) 인터뷰 테이블 정의*/
const Interview = sequelize.define('interview', {
    id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        allowNull: false,
        autoIncrement: true
    },
    title: {
        type: Sequelize.STRING,
        allowNull: true
    },
    date: {
        type: Sequelize.STRING,
        allowNull: true
    },
    body: {
        type: Sequelize.TEXT,
        allowNull: true
    }
}, {});

/* AWS S3 SDK 설정 */
const s3 = new AWS.S3();
AWS.config.region = 'ap-northeast-2';

/*인터뷰 추가 템플릿 연결 라우터*/
app.get('interviews/new', (req, res)=>{
    res.render('new');
});

/*인터뷰 form 데이터 -> RDS 추가 라우터*/
app.post('interviews/new', (req, res)=>{
    Interview.create({
            title: req.body.title,
            date: req.body.date,
            body: req.body.body
        }).then(results=>{
            res.redirect('/interviews/'+ results[0].id +'/photo');
        }).catch((err)=>{
            // error handling
        });
});

/* 관리자용 인터뷰 수정
권한 인증과정 구현할 것 */
app.get('/interviews/:id/edit', (req, res)=>{
    
});

/* 관리자용 인터뷰 삭제
권한 인증과정 구현할 것 */
app.get('/interviews/:id/delete', (req, res)=>{

});

/*인터뷰 추가 후 사진 등록 템플릿 연결 라우터*/
app.get('/interviews/:id/photo', (req, res)=>{
    let id = req.params.id;
    res.render('photoAdd', { id:id });
});

/*사진 S3 등록 라우터*/
app.post('/interviews/:id/photo', (req, res)=>{
    let id = req.params.id;
    let form = new formidable.IncomingForm();
    form.parse(req, (Error, fields, files)=>{
        let params = {
            Bucket: 'human-of-psyche', // required: S3 bucket 설정
            Key: id, // required: S3에 저장될 파일 이름 설정. 확장자가 자동으로 추가되는지?(우선 확장자가 없어도 url을 통해 접근할 수는 있다)
            ACL: 'private', // (?) 권한 설정(변경 필요. public으로 하면 안된다.)
            Body: require('fs').createReadStream(files.input_file.path),  // files(사용자가 업로드한 파일의 정보).input_file(<form>의 input type의 name)
            // form.parse를 통해 파일을 읽어 임시경로(path)에 저장된 상태. 다시 S3에 저장하기 위해 임시경로의 파일을 stream으로 읽는다.
            ContentType: 'image/jpg'  // 저절로 파일이 다운로드 되는 것 방지
        };
        s3.upload(params, (err, data)=>{  // 임시파일을 s3에 업로드
            if(err) {
                res.send('Image Upload Fail');
                console.log(err);
            } else{
                require('fs').unlink(files.input_file.path, (err)=>{  // EC2 내 임시파일 삭제
                    if(err) {
                        res.send('tmp img file delete: fail');
                        console.log(err);
                    } else{
                        res.redirect('/interviews');
                    }
                });
            }
        });
    });
});

/*개별 인터뷰 페이지*/
app.get('/interviews/:id', (req, res)=>{
    let id = req.params.id;
    Interview.findById(id)
        .then((results)=>{  // [{}]: json형식으로 반환하는지 확인 필요
            res.render('interview', {results:results});
        })
        .catch((err)=>{
            //error handling
        });
});

/*
   - S3의 StorageClass: 'STANDARD'가 아니라 'REDUCED_REDUNDANCY'로 저장하는 법 강구할 것
*/
/* 메인 페이지(HOP 간단 소개 + 모든 인터뷰 사진 리스트)*/
app.get('/interviews', (req, res)=>{
    let params = {
        Bucket: "human-of-psyche"
    };
    s3.listObjects(params, (err, data)=>{
        if(err){
                console.log(err, err.stack);
        }
        else{
            if(req.user && req.user.displayname){
                res.render('index', {Contents:data.Contents, auth:req.user.displayname});        
            } else{
                res.render('index', {Contents:data.Contents});
            }
        }
    });
});

/* HOP 소개 페이지 */
app.get('/about', (req, res)=>{
    res.render('about');
});


/* local strategy 함수 */
passport.serializeUser((user, done)=>{
    done(null, user.username);  // 두번째 인자로 식별자를 전달
});
passport.deserializeUser((id, done)=>{
    let user = admin[0];  // req.user로 admin 객체를 전달하기 위함
    if(id === user.username){
        return done(null, user)  // user 객체는 req.user로 전달된다(로그인 여부 확인)
    }
});
passport.use(new LocalStrategy(
    (username, password, done)=>{
        let username_input = username,
            password_input = password;
        if(username_input === admin[0].username){
            return hasher({ password:password_input, salt:admin[0].salt }, (err, pass, salt, hash)=>{
                if(hash === admin[0].password){
                    done(null, admin[0]);  // admin[0]은 serializeUser의 첫번째 인자 user로 전달
                } else{
                    done(null, false);
                }
            })
        }
        done(null, false);
    }
));

/* 관리자용 로그인 페이지 */
app.get('/login', (req, res)=>{
    res.render('login');
});

app.post('/login',
    passport.authenticate(
        'local',  // local strategy
        {
            successRedirect: '/interviews',
            failureRedirect: '/login',
            failureFlash: false
        }
    )
);

app.listen(80, ()=>{
    console.log('Connected: 80 port');
});