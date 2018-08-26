/*  이슈
    - 우분투 sudo 권한 문제
    - 관리자 수정, 삭제 구현
    - (나중에) RDS public access '예' 설정 상태(workbench 사용 시 public 필요). 추후 '아니요'로 바꿔야 함(보안상)
    - S3 객체 업로드(public-read), 버킷설정(퍼블릭 읽기 권한) 상태. (보안상 이슈가 없는지 확인 필요)
    - S3의 StorageClass: 'STANDARD'가 아니라 'REDUCED_REDUNDANCY'로 저장하는 법 강구할 것
*/
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

/* 세션 설정(passport) */
app.use(session({
    secret: 'gmlckddlWkd%(%(',
    resave: false,
    saveUninitialized: true
})); 
app.use(passport.initialize());  // passport 초기화
app.use(passport.session());  // (session 초기화 뒤쪽에 위치해야 함)

app.set('views', './templete');
app.set('view engine', 'pug');

/* AWS S3 SDK 설정 */
const s3 = new AWS.S3();
AWS.config.region = 'ap-northeast-2';

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
const sequelize = new Sequelize(  // 추후 모든 인증 정보를 symbol based operator로 수정 필요
    'o2',  // RDS 데이터베이스 이름
    'heech1013',  // 유저 명(RDS - master id)
    'gml3413rds', // 비밀번호(RDS - matser pw)
    {
        'host': 'human-of-psyche.cuhu0wiij8n2.ap-northeast-2.rds.amazonaws.com',  // 데이터베이스 호스트(RDS -endpoint)
        'port': 3306,  // RDS 사용 포트(default)
        'dialect': 'mysql',  // 사용할 데이터베이스 종류
        'logging': false  // console.log
    }
);

/* RDS(mysql) 인터뷰 테이블 정의*/
const Interview = sequelize.define('interview', {
    id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        allowNull: true,
        autoIncrement: true
    },
    title: {  // 인터뷰 타이틀
        type: Sequelize.STRING,
        allowNull: true
    },
    date: {  // 인터뷰 날짜
        type: Sequelize.STRING,
        allowNull: true
    },
    body: {  // 인터뷰 내용
        type: Sequelize.TEXT,
        allowNull: true
    },
    img_src: {  // 인터뷰 사진(src)
        type: Sequelize.STRING,
        allowNull: true
    }
},
{
    tableName: 'interviews',  // table 이름
    freezeTableName: true  // sequelize가 자동으로 table 명을 plural로 바꾸는 기능 방지
});

/* DB 싱크화 */
Interview.sequelize.sync().then( ()=>{  // sync(): 이미 만들어진 table에 model을 매핑하며, table이 없는 경우 정의한 model을 바탕으로 table을 생성
        console.log('DB Sync: Completed');
    }).catch(err=>{
        console.log('DB Sync: Failed');
        console.log(err)
    });

/* 인터뷰 추가 */
app.get('/interviews/new', (req, res)=>{
    res.render('new');
});

/* 인터뷰 form 데이터 -> RDS에 추가 (-> S3 사진 등록으로 연결) */
app.post('/interviews/new', (req, res)=>{
    Interview.create({
            title: req.body.title,
            date: req.body.date,
            body: req.body.body
        }).then(results=>{
            res.redirect('/interviews/'+ results.dataValues.id +'/photo');
        }).catch((err)=>{
            res.send('Internal Server Error');
            console.log(err);
        });
});

/* 관리자용 인터뷰 수정 (추후 작업 필요. 인증과정 삽입 필요) */
app.get('/interviews/:id/edit', (req, res)=>{
    if(req.user&&req.user.displayname){
        res.render('edit');
    }
});
app.post('/interviews/:id/edit', (req, res)=>{
    let id = req.params.id;
    Interview.update(
            {
                
            },
            {

            }
    )
});
/* 관리자용 인터뷰 삭제 (추후 작업 필요. 인증과정 삽입 필요) */
app.get('/interviews/:id/delete', (req, res)=>{
});

/* 인터뷰 추가(RDS) 후 사진 등록(S3) 템플릿 연결 라우터 */
app.get('/interviews/:id/photo', (req, res)=>{
    let id = req.params.id;
    res.render('photoAdd', { id:id });
});

/* 사진 S3 등록 라우터 */
app.post('/interviews/:id/photo', (req, res)=>{
    let id = req.params.id;
    let form = new formidable.IncomingForm();
    form.parse(req, (Error, fields, files)=>{
        let params = {
            Bucket: 'human-of-psyche', // required: S3 bucket 설정
            Key: id + '.jpg', // required: S3에 저장될 파일 이름 설정.
            ACL: 'public-read', // public-read로 설정해야 웹에서 이미지로 접근할 수 있다. (보안상 public으로 하면 좋지 않다고 한다)
            Body: require('fs').createReadStream(files.input_file.path),  // files(사용자가 업로드한 파일의 정보).input_file(<form>의 input type의 name)
            // form.parse를 통해 파일을 읽어 임시경로(path)에 저장된 상태. 다시 S3에 저장하기 위해 임시경로의 파일을 stream으로 읽는다.
            ContentType: 'image/jpg'  // 저절로 파일이 다운로드 되는 것 방지
        };
        /* 임시파일을 s3에 업로드 */
        s3.upload(params, (err, data)=>{
            if(err) {
                res.send('Image Upload Fail');
                console.log(err);
            } else{
                console.log('Photo Upload: Complete');
                /* 이미지 파일의 source를 DB(interviews)에 업데이트 */
                Interview.update(
                        {
                            img_src: data.Location
                        },
                        {
                            where: {id: id}
                        }
                    ).then(()=>{
                        console.log('img_src: updated');
                    }).catch((err)=>{
                        console.log(err);
                    });
                /* EC2 내 임시파일 삭제 */
                require('fs').unlink(files.input_file.path, (err)=>{
                    if(err) {
                        res.send('tmp img file delete: fail');
                        console.log(err);
                    } else{
                        console.log('tmp Image File Delete: Complete');
                        res.redirect('/interviews');
                    }
                });
            }
        });
    });
});

/* 개별 인터뷰 페이지 */
app.get('/interviews/:id', (req, res)=>{
    let id = req.params.id;
    Interview.findById(id)
        .then((results)=>{
            res.render('interview', {results:results});
        })
        .catch((err)=>{
            res.send('Internal Server Error');
            console.log(err);
        });
});

/* 메인 페이지 (HOP 간단 소개 + 모든 인터뷰 사진 리스트) */
app.get(['/', '/interviews'], (req, res)=>{
    Interview.findAll().then((results)=>{
            if(req.user && req.user.displayname){
                res.render('index', {results:results, auth:req.user});        
            } else{
                res.render('index', {results:results});
            }
        }).catch((err)=>{
            console.log(err);
        });
});

/* HOP 소개 페이지 */
app.get('/about', (req, res)=>{
    res.render('about');
});


/* local strategy 함수 설정 */
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

/* 관리자용 로그아웃 */
app.get('/logout', (req, res)=>{
    req.logout();
    req.session.save(()=>{
        res.redirect('/interviews');
    });
});

app.listen(80, ()=>{
    console.log('Connected: 80 port');
});