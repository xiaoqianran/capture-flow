package ai

import "github.com/xiaoqianran/capture-flow/internal/domain"

// BuiltinRecipes are shipped with the hub.
func BuiltinRecipes() map[string]domain.Recipe {
	list := []domain.Recipe{
		{
			ID:          "summarize",
			Name:        "中文摘要",
			Description: "用简洁中文总结正文要点",
			SystemPrompt: "你是严谨的阅读助手。根据用户提供的网页/文章内容写摘要。" +
				"要求：使用中文；保留关键事实与结论；不要编造原文没有的信息；可用短列表。",
			UserTemplate: "标题：{{title}}\n作者：{{author}}\n来源：{{source}} / {{type}}\nURL：{{url}}\n\n正文：\n{{content_md}}\n\n请输出结构化摘要。",
		},
		{
			ID:          "outline",
			Name:        "大纲提炼",
			Description: "提炼多级大纲",
			SystemPrompt: "你是结构化笔记助手。根据原文提炼多级 Markdown 大纲。" +
				"只基于原文；条目简洁；中文输出。",
			UserTemplate: "标题：{{title}}\nURL：{{url}}\n\n正文：\n{{content_md}}\n\n请输出 Markdown 大纲（# / ## / -）。",
		},
		{
			ID:          "qa-prep",
			Name:        "问答要点",
			Description: "列出可继续追问的关键问题与原文依据",
			SystemPrompt: "你是研究助手。阅读原文后给出：1) 核心论断 2) 支撑证据 3) 值得继续追问的问题。" +
				"中文；不编造。",
			UserTemplate: "标题：{{title}}\n作者：{{author}}\n\n正文：\n{{content_md}}",
		},
	}
	out := make(map[string]domain.Recipe, len(list))
	for _, r := range list {
		out[r.ID] = r
	}
	return out
}

// ListRecipes returns builtin recipes sorted by id for stable API output.
func ListRecipes() []domain.Recipe {
	m := BuiltinRecipes()
	order := []string{"summarize", "outline", "qa-prep"}
	out := make([]domain.Recipe, 0, len(order))
	for _, id := range order {
		if r, ok := m[id]; ok {
			out = append(out, r)
		}
	}
	return out
}
