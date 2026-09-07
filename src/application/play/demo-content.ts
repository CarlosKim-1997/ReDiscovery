export const PUBLIC_DEMO_DAILY = Object.freeze({
  label: "오늘의 사고 문제",
  estimatedMinutes: 3,
  scenario: "같은 회사가 두 개의 소프트웨어를 만들었습니다. 한 제품은 기능별 팀이 서로 거의 따로 일했고, 결과물도 기능 사이의 연결이 약했습니다. 다른 제품은 여러 역할이 한 팀에서 자주 이야기했고, 결과물의 기능도 서로 촘촘히 연결되었습니다. 이런 차이는 프로젝트가 바뀌어도 반복되었습니다.",
  question: "왜 조직이 일하는 방식과 결과물의 구조가 자꾸 비슷한 모양을 띠게 될까요?",
});

export type PublicDemoDaily = typeof PUBLIC_DEMO_DAILY;
