# 安全说明

## 数据边界

- 本主题只连接 `127.0.0.1` 上的 Codex 本地调试端点（CDP）；
- 不访问外部网络，不收集、不上传任何使用数据；
- 不读取凭据、密钥或 Cookie；注入器只读写外观相关的 DOM、Store 与既有查询缓存；
- 不发送模型请求、不创建 Goal，因此不会额外消耗模型 Token。

## 本机文件

- `runtime.json`：每次应用时记录本机调试端口、PID 与 Codex 版本；属本机运行记录，已由 `.gitignore` 排除，不应提交或分发；
- `engine/surface-theme.log`：注入器本地日志（`*.log` 已排除），仅用于本机排查；
- 偏好保存在 Codex 渲染器 `localStorage`，卸载主题不会清除。

## 校验发布包

在解压目录内运行以下 PowerShell 校验全部公开文件：

```powershell
$expected = Get-Content SHA256SUMS.txt | Where-Object { $_ -and -not $_.StartsWith('#') }
$fail = 0
foreach ($line in $expected) {
  $hash, $rel = ($line -split '\s{2}', 2)
  $actual = (Get-FileHash -LiteralPath $rel -Algorithm SHA256).Hash.ToUpperInvariant()
  if ($actual -ne $hash) { Write-Host "MISMATCH $rel"; $fail++ }
}
if ($fail -eq 0) { Write-Host 'SHA256SUMS=PASS' } else { Write-Host "FAIL=$fail" }
```

## 维护者保密义务

公开仓库不得包含绝对用户路径、用户名、任务/线程 ID、调试端口与 PID、私有截图、机器专用状态文件或未获授权的第三方/官方资产。发现泄露应立即删除历史引用。

## 漏洞报告

请通过本仓库 Issues 提交。报告中请勿包含本地绝对路径、调试端口、PID、线程 ID、私有截图或其他敏感信息；复现步骤应使用脱敏示例。
