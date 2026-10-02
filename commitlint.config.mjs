export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // 本项目历史提交使用中文描述，放开 subject 大小写与长度限制
    'subject-case': [0],
    'subject-max-length': [2, 'always', 100],
    'header-max-length': [2, 'always', 120],
    'body-max-line-length': [0],
  },
}
