import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Wipe first so the seed can be re-run without duplicating rows. Order
  // matters: children before parents, or foreign keys block the delete.
  await prisma.roundQuestion.deleteMany();
  await prisma.round.deleteMany();
  await prisma.role.deleteMany();
  await prisma.company.deleteMany();
  await prisma.question.deleteMany();

  // ---------------------------------------------------------------- questions
  // General-bank questions: not tied to any company, reusable across rounds.
  const q = {
    aptitudeSpeed: await prisma.question.create({
      data: {
        text: "A train travels 360 km in 4 hours. If it increases speed by 15 km/h, how long will the same journey take?",
        category: "other",
        difficulty: "easy",
        questionType: "text",
        expectedAnswerPoints: [
          "Original speed = 360 / 4 = 90 km/h",
          "New speed = 90 + 15 = 105 km/h",
          "New time = 360 / 105 ≈ 3.43 hours (about 3 h 26 min)",
        ],
      },
    }),
    osProcessThread: await prisma.question.create({
      data: {
        text: "Explain the difference between a process and a thread.",
        category: "os",
        difficulty: "easy",
        questionType: "text",
        expectedAnswerPoints: [
          "A process is an independent program in execution with its own address space",
          "A thread is a unit of execution within a process",
          "Threads of one process share code, data and heap; each has its own stack and registers",
          "Context switching between threads is cheaper than between processes",
          "A crash in one process does not directly affect another; a crashing thread can bring down its whole process",
        ],
      },
    }),
    osDeadlock: await prisma.question.create({
      data: {
        text: "What is a deadlock? State the four necessary conditions for it to occur.",
        category: "os",
        difficulty: "medium",
        questionType: "text",
        expectedAnswerPoints: [
          "Deadlock is a state where processes each hold a resource and wait for another, so none can proceed",
          "Mutual exclusion: at least one resource is held in a non-shareable mode",
          "Hold and wait: a process holds one resource while waiting for others",
          "No preemption: resources cannot be forcibly taken from a process",
          "Circular wait: a closed chain of processes each waiting on the next",
          "All four must hold simultaneously; breaking any one prevents deadlock",
        ],
      },
    }),
    cnHandshake: await prisma.question.create({
      data: {
        text: "Explain the TCP three-way handshake.",
        category: "cn",
        difficulty: "medium",
        questionType: "text",
        expectedAnswerPoints: [
          "Client sends SYN with its initial sequence number",
          "Server replies SYN-ACK, acknowledging the client's sequence number and sending its own",
          "Client sends ACK acknowledging the server's sequence number",
          "Purpose is to synchronise sequence numbers and confirm both directions are usable",
          "Connection moves to ESTABLISHED after the final ACK",
        ],
      },
    }),
    cnTcpUdp: await prisma.question.create({
      data: {
        text: "What is the difference between TCP and UDP?",
        category: "cn",
        difficulty: "easy",
        questionType: "text",
        expectedAnswerPoints: [
          "TCP is connection-oriented; UDP is connectionless",
          "TCP guarantees delivery, ordering and de-duplication; UDP does not",
          "TCP provides flow control and congestion control; UDP does not",
          "UDP has lower overhead and latency, with an 8-byte header versus TCP's 20+",
          "TCP suits file transfer and web traffic; UDP suits streaming, gaming and DNS",
        ],
      },
    }),
    dbmsNormalization: await prisma.question.create({
      data: {
        text: "What is normalization? Explain 1NF, 2NF and 3NF.",
        category: "dbms",
        difficulty: "medium",
        questionType: "text",
        expectedAnswerPoints: [
          "Normalization organises data to reduce redundancy and avoid update, insert and delete anomalies",
          "1NF: all attributes hold atomic values, with no repeating groups",
          "2NF: in 1NF and every non-key attribute fully depends on the whole primary key (removes partial dependency)",
          "3NF: in 2NF and no non-key attribute depends on another non-key attribute (removes transitive dependency)",
          "Trade-off: higher normal forms mean more joins, so denormalization is sometimes deliberate",
        ],
      },
    }),
    dbmsIndex: await prisma.question.create({
      data: {
        text: "What is the difference between a clustered and a non-clustered index?",
        category: "dbms",
        difficulty: "hard",
        questionType: "text",
        expectedAnswerPoints: [
          "A clustered index determines the physical storage order of rows in the table",
          "There can be only one clustered index per table",
          "A non-clustered index is a separate structure holding key values and pointers to the rows",
          "A table can have many non-clustered indexes",
          "Non-clustered lookups may need an extra step to fetch the full row",
        ],
      },
    }),
    dsaBinarySearch: await prisma.question.create({
      data: {
        text: "What is the time complexity of binary search, and what precondition does it require?",
        category: "dsa",
        difficulty: "easy",
        questionType: "text",
        expectedAnswerPoints: [
          "O(log n) time in the worst and average case",
          "O(1) space iteratively, O(log n) recursively due to the call stack",
          "Requires the input to be sorted",
          "Each comparison halves the remaining search space",
        ],
      },
    }),
    dsaReverseList: await prisma.question.create({
      data: {
        text: "Given the head of a singly linked list, reverse the list and return the new head.",
        category: "dsa",
        difficulty: "medium",
        questionType: "coding",
        expectedAnswerPoints: [
          "Iterative approach with prev, curr and next pointers",
          "Runs in O(n) time and O(1) space",
          "Handles empty list and single-node list without special-casing",
        ],
      },
    }),
    hrAboutYourself: await prisma.question.create({
      data: {
        text: "Tell me about yourself.",
        category: "general_hr",
        difficulty: "easy",
        questionType: "text",
        expectedAnswerPoints: [
          "Opens with current status: course, branch, year",
          "Highlights two or three relevant projects or internships",
          "Connects skills explicitly to the role applied for",
          "Stays under roughly two minutes and avoids reciting the CV line by line",
        ],
      },
    }),
    hrGdRemoteWork: await prisma.question.create({
      data: {
        text: "Group discussion: Is remote work sustainable for entry-level employees?",
        category: "other",
        difficulty: "medium",
        questionType: "text",
        expectedAnswerPoints: [
          "Takes a clear position and states it early",
          "Offers at least one point on each side before concluding",
          "Supports claims with an example or data rather than assertion",
          "Invites quieter participants in rather than dominating the discussion",
        ],
      },
    }),
    // Company-specific questions.
    tcsWhy: await prisma.question.create({
      data: {
        text: "Why do you want to join TCS, and what do you know about our service delivery model?",
        category: "company_specific",
        difficulty: "easy",
        questionType: "text",
        expectedAnswerPoints: [
          "Shows specific knowledge of TCS rather than generic praise",
          "Mentions the global delivery model or a named business unit",
          "Links personal goals to the company's training and career path",
          "Avoids reasons that apply equally to any employer",
        ],
      },
    }),
    deloitteStakeholder: await prisma.question.create({
      data: {
        text: "Describe a time you handled conflicting stakeholder priorities. How did you decide what to do?",
        category: "company_specific",
        difficulty: "medium",
        questionType: "text",
        expectedAnswerPoints: [
          "Uses a structured format such as STAR (situation, task, action, result)",
          "Names the competing priorities and the actual trade-off",
          "Explains the decision criteria used, not just the outcome",
          "States a measurable result and a reflection on what would change next time",
        ],
      },
    }),
  };

  // ------------------------------------------------- company 1: four rounds
  // Deliberately different in shape from company 2, including a coding round.
  const tcs = await prisma.company.create({
    data: {
      name: "TCS",
      roles: {
        create: {
          name: "Systems Engineer",
          rounds: {
            create: [
              {
                order: 1,
                roundType: "aptitude",
                roundName: "Aptitude Test",
                notes: "Quantitative, logical reasoning and verbal ability. 90 minutes.",
              },
              {
                order: 2,
                roundType: "technical",
                roundName: "Technical Interview",
                notes: "Core CS fundamentals plus project discussion.",
              },
              {
                order: 3,
                roundType: "coding",
                roundName: "Coding Round",
                notes: "Data structures problem solved in the browser.",
              },
              {
                order: 4,
                roundType: "hr",
                roundName: "HR Interview",
                notes: "Fit, communication and relocation willingness.",
              },
            ],
          },
        },
      },
    },
    include: { roles: { include: { rounds: true } } },
  });

  // ------------------------------------------------- company 2: two rounds
  // No coding round, and starts with a group discussion instead of aptitude.
  const deloitte = await prisma.company.create({
    data: {
      name: "Deloitte",
      roles: {
        create: {
          name: "Business Analyst",
          rounds: {
            create: [
              {
                order: 1,
                roundType: "group_discussion",
                roundName: "Group Discussion",
                notes: "Eight candidates, 15 minutes on a current-affairs topic.",
              },
              {
                order: 2,
                roundType: "hr",
                roundName: "HR Interview",
                notes: "Behavioural questions using the STAR format.",
              },
            ],
          },
        },
      },
    },
    include: { roles: { include: { rounds: true } } },
  });

  const tcsRounds = tcs.roles[0].rounds;
  const deloitteRounds = deloitte.roles[0].rounds;
  const roundBy = (rounds: { order: number; id: string }[], order: number) =>
    rounds.find((r) => r.order === order)!.id;

  // ------------------------------------------------------------ attachments
  // Mixes general-bank and company-specific questions inside the same round,
  // which is the point of the join table. Note hrAboutYourself is attached to
  // both companies' HR rounds — one question row, reused.
  await prisma.roundQuestion.createMany({
    data: [
      // TCS round 1 — aptitude
      { roundId: roundBy(tcsRounds, 1), questionId: q.aptitudeSpeed.id },
      // TCS round 2 — technical: general bank + company-specific together
      { roundId: roundBy(tcsRounds, 2), questionId: q.osProcessThread.id },
      { roundId: roundBy(tcsRounds, 2), questionId: q.osDeadlock.id },
      { roundId: roundBy(tcsRounds, 2), questionId: q.cnHandshake.id },
      { roundId: roundBy(tcsRounds, 2), questionId: q.dbmsNormalization.id },
      { roundId: roundBy(tcsRounds, 2), questionId: q.dsaBinarySearch.id },
      // TCS round 3 — coding
      { roundId: roundBy(tcsRounds, 3), questionId: q.dsaReverseList.id },
      // TCS round 4 — hr
      { roundId: roundBy(tcsRounds, 4), questionId: q.hrAboutYourself.id },
      { roundId: roundBy(tcsRounds, 4), questionId: q.tcsWhy.id },

      // Deloitte round 1 — group discussion
      { roundId: roundBy(deloitteRounds, 1), questionId: q.hrGdRemoteWork.id },
      // Deloitte round 2 — hr: shares hrAboutYourself with TCS
      { roundId: roundBy(deloitteRounds, 2), questionId: q.hrAboutYourself.id },
      { roundId: roundBy(deloitteRounds, 2), questionId: q.deloitteStakeholder.id },
      { roundId: roundBy(deloitteRounds, 2), questionId: q.cnTcpUdp.id },
      { roundId: roundBy(deloitteRounds, 2), questionId: q.dbmsIndex.id },
    ],
  });

  const counts = {
    companies: await prisma.company.count(),
    roles: await prisma.role.count(),
    rounds: await prisma.round.count(),
    questions: await prisma.question.count(),
    links: await prisma.roundQuestion.count(),
  };
  console.log("Seed complete:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
