# 音色资源包

网页匹配时只读取 `女性音色/成熟` 和 `男性音色/成熟`。`幼态` 目录中的音色仅用于试听和人工复核，默认不会出现在自动推荐中。

## 目录

```
manifest.json
女性音色/成熟/
女性音色/幼态/
男性音色/成熟/
男性音色/幼态/
原始资源/女性音色/
原始资源/男性音色/
```

`原始资源` 保留未分类的男女音色文件，适合一并提交到 GitHub；网页实际播放与匹配使用前四个分类目录。

## 添加新音色

1. 把音频放到 `原始资源/女性音色` 或 `原始资源/男性音色`。
2. 根据听感复制一份到对应的 `成熟` 或 `幼态` 目录。
3. 在 `manifest.json` 的 `voices` 数组中追加一条记录：`voiceId` 必须唯一且来自最新 JSON；`sourceVoiceId` 应与它相同；`gender` 为 `female` 或 `male`；`maturity` 为 `mature` 或 `young`；`audioPath` 指向分类目录内的文件。`audioFile` 可以与 voiceId 不同，但必须是该 voiceId 对应 URL 的文件名。
4. 填写 `profile` 的六个 0 到 1 的声线参数：`authority`、`warmth`、`intimacy`、`energy`、`restraint`、`brightness`。自动匹配只使用这些声线参数和角色文本，不依据音色名称。
5. 重新导入整个资源包，在资源库试听并确认分类。

### 文件名与 ID

- `voiceId` 是唯一主键，也是最终导出的值；不要用显示名称或文件名替代它。
- `voiceName` 是页面展示名称，可以使用中文；`audioFile` 是实际文件名，可以与前两者不同。
- 新增资源时建议文件名也使用清晰的英文/拼音，例如 `custom_wen_rou_nv_01.wav`，但网页只以 `manifest.json` 中的 `voiceId -> audioPath` 映射为准。
- 从网页临时添加的资源，要复制到对应目录并把网页确认过的 `voiceId`、`gender`、`maturity`、`audioFile`、`audioPath` 写入 manifest 后，才会成为可提交 GitHub 的正式资源。
