hexo.extend.filter.register('theme_inject', function(injects) {
  injects.bodyEnd.raw('load-aplayer', `
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/aplayer/dist/APlayer.min.css">
    <script src="https://cdn.jsdelivr.net/npm/aplayer/dist/APlayer.min.js"></script>
    
    <div id="aplayer-fixed" class="aplayer"></div>

    <script>
      const ap = new APlayer({
        container: document.getElementById('aplayer-fixed'),
        fixed: true,          // 吸底模式
        mini: true,           // 迷你模式
        order: 'random',      // 随机播放
        autoplay: true,       // 自动播放
        audio: [
        {
          name: '成都',
          artist: '赵雷',
          url: '/music/成都.mp3',   // 这里的路径相对于 source 目录
          cover: '/music-cover/成都.jpg'   // 封面图路径
        },
        {
          name: 'AmysLullabyII',
          artist: 'Mars Lasar',
          url: '/music/AmysLullabyII.mp3',
          cover: '/music-cover/AmysLullabyII.jpg'
        },
        {
          name: 'Five Hundred Miles',
          artist: 'Justin Timberlake; ',
          url: '/music/FiveHundredMiles.mp3',
          cover: '/music-cover/FiveHundredMiles.jpg'
        },
        {
          name: 'On a Slow Boat To China',
          artist: 'Luke Thompson',
          url: '/music/OnaSlowBoatToChina.mp3',
          cover: '/music-cover/OnaSlowBoatToChina.jpg'
        },
        {
          name: '阿拉斯加海湾',
          artist: '蓝心羽',
          url: '/music/阿拉斯加海湾.mp3',
          cover: '/music-cover/阿拉斯加海湾.jpg'
        },
        {
          name: '安河桥',
          artist: '宋冬野',
          url: '/music/anheqiao.mp3',
          cover: '/music-cover/安河桥.jpg'
        },
        {
          name: '好久不见',
          artist: '陈奕迅',
          url: '/music/好久不见.mp3',
          cover: '/music-cover/好久不见.jpg'
        },
        {
          name: '麻雀',
          artist: '李荣浩',
          url: '/music/麻雀.mp3',
          cover: '/music-cover/麻雀.jpg'
        },
        {
          name: '平凡之路',
          artist: '朴树',
          url: '/music/平凡之路.mp3',
          cover: '/music-cover/平凡之路.jpg'
        },
        {
          name: '听闻远方有你',
          artist: '刘艺雯',
          url: '/music/听闻远方有你.mp3',
          cover: '/music-cover/听闻远方有你.jpg'
        },
        {
          name: '无赖',
          artist: '郑中基',
          url: '/music/无赖.mp3',
          cover: '/music-cover/无赖.jpg'
        },
        {
          name: '呓语',
          artist: '蒋卓林',
          url: '/music/呓语.mp3',
          cover: '/music-cover/呓语.jpg'
        },
        {
          name: '这些民谣一次听个够',
          artist: '翁大涵',
          url: '/music/这些民谣一次听个够.mp3',
          cover: '/music-cover/这些民谣一次听个够.jpg'
        }
        ]
      });
    </script>
  `);
});