# Heavenly-Feeding-
天堂投喂是一款 2D 实时网页联机 1v1 对战游戏。 两名玩家分居屏幕左右，操纵角色与手中筷子，通过走位与精确操作，将随机掉落的食物“喂”给对手。 谁先被吃撑，谁失败。

## 一、玩法规则

* 游戏模式：**网页实时 1v1**
* 场景：单屏 2D，玩家分居左右
* 食物随机从上方掉落，每种有不同饱腹值
* 将食物喂给对手，**先被吃撑者失败**

### 夹取与喂食

* 筷子尖端接触食物可夹取
* 夹取后食物通过**软物理约束**跟随筷子
* 食物进入对方嘴部区域并持续停留
* 停留达标 → 食物被吃掉 → 对方饱腹值增加

---

## 二、操作设计（固定）

### 移动

* **W / A / S / D** 控制移动
* 支持 8 方向叠加（如 `W + D = 右上`）
* 移动向量必须归一化（斜向不加速）

### 筷子方向

* 筷子方向 = **玩家中心 → 鼠标位置向量**
* 鼠标只提供**目标角度**

### 旋转限制（关键）

* 筷子真实角度 **限制最大角速度**
* 以有限转速逐帧追随目标角度
* 防止 DPI 优势、瞬时穿模、联机不确定性

---

## 三、吸附与判定

### 锥形吸附

* 筷子尖端前方存在锥形吸附区
* 条件：

  * 距离 ≤ 吸附半径
  * 角度差 ≤ 锥形半角
* 进入锥形区域 → 可夹取

### 夹取限制

* 每名玩家同时最多夹取 **1 个食物**
* 可主动释放

---

## 四、联机要求（强制）

* **网页实时联机为前提**
* 本地模式仅用于开发测试
* 架构：**Input-based + 服务器权威**

### 客户端

* WASD 移动输入
* 鼠标目标角度
* 本地预测与渲染

### 服务器

* 玩家真实位置
* 筷子真实角度（含限速）
* 吸附 / 夹取 / 喂食判定
* 饱腹值与胜负结算

#### 输入示例

```json
{ "move": { "x": 0.707, "y": -0.707 }, "aim": 1.82 }
```

---

## 五、技术选型

### 客户端

* JavaScript
* **Phaser 3**
* **Matter.js**
* 浏览器运行

### 服务端

* Node.js
* WebSocket
* 仅维护 1v1 房间

---

## 六、运行与联机

### 本地运行

```bash
npm install
npm start
```

浏览器打开 `http://localhost:3000`。

### 邀请朋友联机（房间 + 就绪）

打开页面后会自动生成房间参数 `?room=xxxx`，把当前浏览器地址发给朋友。  
两人进入后点击“就绪”，双方就绪才会开始游戏。

### 公网分享（ngrok，免费）

1) 安装 ngrok
```bash
brew install ngrok/ngrok/ngrok
```

2) 配置 Authtoken（仅一次）
```bash
ngrok config add-authtoken <你的token>
```

3) 运行服务并开启隧道
```bash
npm start
ngrok http 3000
```

ngrok 会输出一个 `https://xxxx.ngrok-free.app` 的公网链接，把它发给朋友即可。  
注意：ngrok 免费链接每次启动都会变化。

### 线上部署（阿里云 + 域名）

已部署到 `https://heavenlyfeeding.com`（Nginx 反代 + Node 服务）。  
如需自行部署，可参考以下流程：

1) 服务器安装依赖（Alibaba Cloud Linux / RHEL）
```bash
sudo dnf install -y git nginx
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs
```

2) 拉取代码并安装依赖
```bash
sudo mkdir -p /opt/heavenly-feeding
sudo chown -R admin:admin /opt/heavenly-feeding
git clone https://github.com/CyborgV/Heavenly-Feeding-.git /opt/heavenly-feeding
cd /opt/heavenly-feeding
npm install
```

3) systemd 常驻服务
```bash
sudo tee /etc/systemd/system/heavenly-feeding.service > /dev/null <<'EOF'
[Unit]
Description=Heavenly Feeding Server
After=network.target

[Service]
Type=simple
User=admin
WorkingDirectory=/opt/heavenly-feeding
Environment=PORT=3000
ExecStart=/usr/bin/node /opt/heavenly-feeding/server/index.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now heavenly-feeding
```

4) Nginx 反向代理
```bash
sudo tee /etc/nginx/conf.d/heavenlyfeeding.conf > /dev/null <<'EOF'
server {
    listen 80;
    server_name heavenlyfeeding.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
EOF

sudo nginx -t
sudo systemctl enable --now nginx
```

5) HTTPS 证书（Certbot）
```bash
sudo dnf install -y certbot python3-certbot-nginx
sudo certbot --nginx -d heavenlyfeeding.com
```

需要确保安全组开放 80/443，并在 Cloudflare 中将域名 A 记录指向服务器公网 IP。

---

## 七、美术与调试

* 风格：**日本浮世绘**
* 有限色板 + 强轮廓
* 判定不依赖美术
* Debug 必须可视化：

  * 锥形吸附区
  * 嘴部判定区
  * 食物状态

---

## 八、非目标

* 不做 AI 作为核心玩法
* 不做多人乱斗 / 大地图
* 不做帧级格斗连招
* 不信任客户端判定

---
**本 README 为项目唯一权威规格说明。**
