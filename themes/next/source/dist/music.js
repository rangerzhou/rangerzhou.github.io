const ap = new APlayer({
    container: document.getElementById('aplayer'), // 播放器 HTML 容器元素
    fixed: true,
    autoplay: true,
    order: 'random', // 音频循环顺序, 可选值: 'list'列表循环, 'random'随机循环
    preload: 'auto', // 预加载，可选值: 'none', 'metadata', 'auto'
    theme: '#FADFA3', // 主题
    volume: 0.7, // 默认音量
    mutex: true, // 互斥，阻止多个播放器同时播放，当前播放器播放时暂停其他播放器
    listFolded: false, // 列表默认折叠
    //lrcType: 3, // 歌词传递方式
    audio: [{
        name: "Five Hundred Miles",
        artist: 'Justin Timberlake',
        url: '/dist/MusicList/FiveHundredMiles.mp3',
        cover: 'http://p2.music.126.net/ggnyubDdMxrhpqYvpZbhEQ==/3302932937412681.jpg?param=130y130',
    },
    {
        name: "阿拉斯加海湾",
        artist: '蓝心羽',
        url: '/dist/MusicList/阿拉斯加海湾.mp3',
        cover: 'http://p2.music.126.net/ggnyubDdMxrhpqYvpZbhEQ==/3302932937412681.jpg?param=130y130',
    },
    {
        name: "听闻远方有你",
        artist: '刘艺雯',
        url: '/dist/MusicList/听闻远方有你.mp3',
        cover: 'http://p2.music.126.net/ggnyubDdMxrhpqYvpZbhEQ==/3302932937412681.jpg?param=130y130',
    },
    {
        name: "Amy's Lullaby II",
        artist: 'Mars Lasar',
        url: "/dist/MusicList/Amy'sLullabyII.mp3",
        cover: 'http://p1.music.126.net/LiRR__0pJHSivqBHZzbMUw==/109951163816225567.jpg?param=130y130',
    },
    {
        name: "成都",
        artist: '赵雷',
        url: '/dist/MusicList/成都.mp3',
        cover: 'http://p1.music.126.net/c5NVKUIAUcyN4BQUDbGnEg==/109951163221157827.jpg?param=130y130',
    },
    {
        name: "呓语",
        artist: '蒋卓林',
        url: '/dist/MusicList/呓语-Somniloquy.mp3',
        cover: 'http://p1.music.126.net/W_5XiCv3rGS1-J7EXpHSCQ==/18885211718782327.jpg?param=130y130',
    },
    {
        name: "麻雀",
        artist: '李荣浩',
        url: '/dist/MusicList/麻雀.mp3',
        cover: 'http://p1.music.126.net/c5NVKUIAUcyN4BQUDbGnEg==/109951163221157827.jpg?param=130y130',
    },
    {
        name: "无赖",
        artist: '郑中基',
        url: "/dist/MusicList/无赖.mp3",
        cover: 'http://p1.music.126.net/LiRR__0pJHSivqBHZzbMUw==/109951163816225567.jpg?param=130y130',
    },
    {
        name: "平凡之路",
        artist: '朴树',
        url: '/dist/MusicList/平凡之路.mp3',
        cover: 'http://p1.music.126.net/W_5XiCv3rGS1-J7EXpHSCQ==/18885211718782327.jpg?param=130y130',
    },
    {
        name: "好久不见",
        artist: '陈奕迅',
        url: '/dist/MusicList/好久不见.mp3',
        cover: 'http://p1.music.126.net/W_5XiCv3rGS1-J7EXpHSCQ==/18885211718782327.jpg?param=130y130',
    },
    {
        name: "这些民谣一次听个够",
        artist: '翁大涵',
        url: '/dist/MusicList/这些民谣一次听个够.mp3',
        cover: 'http://p2.music.126.net/Wx5GNJEpay2JbfVUJc4Aew==/109951163094853876.jpg?param=130y130',
    },
    {
        name: "On a Slow Boat to China",
        artist: 'Luke Thompson',
        url: '/dist/MusicList/OnaSlowBoatToChina.mp3',
        cover: 'http://p2.music.126.net/ggnyubDdMxrhpqYvpZbhEQ==/3302932937412681.jpg?param=130y130',
    }]
});
