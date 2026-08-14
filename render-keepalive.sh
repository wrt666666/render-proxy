#!/bin/bash
CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 https://proxy-burc.onrender.com/health)
if [ "$CODE" != "200" ]; then
  echo "Render VLESS 节点健康检查失败: HTTP $CODE"
  exit 1
fi
# quiet on success