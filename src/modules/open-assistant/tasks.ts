import { EmbedBuilder } from "discord.js";
import supabase from "../supabase.js";
import OpenAssistant from "open-assistant.js";
var oa: OpenAssistant = new OpenAssistant(
  process.env.OA_APIKEY,
  process.env.OA_APIURL
);
import { getLocaleDisplayName, getTranlation } from "./langs.js";
import { taskInteraction } from "./interactions.js";

export async function saveTask(task, lang, user, answer) {
  var taskData = {
    ...task,
    lang: lang,
    ...answer,
  };
  var { data, error } = await supabase
    .from("open_assistant_tasks")
    .insert([{ id: task.id, completedBy: user.id, task: taskData }]);
  return true;
}

export function formatTaskType(type: string) {
  if (type == "assistant_reply") {
    return "reply_as_assistant";
  } else if (type == "user_reply" || type == "prompter_reply") {
    return "reply_as_user";
  } else if (type == "initial_prompt") {
    return "create_initial_prompt";
  } else {
    return type;
  }
}

export async function submitTask(
  taskId,
  user,
  interaction,
  solution,
  lang,
  task,
  client
) {
  var messageId = await oa.acceptTask(taskId, user);
  console.log(messageId, taskId);
  var solveTask = await oa.solveTask(task, user, lang, solution, messageId);
  console.log(solveTask);
  await saveTask(task, lang, user, { messageId: messageId, ...solution });
  var index = client.tasks.findIndex((x) => x.id == taskId);
  if (index > -1) {
    client.tasks.splice(index, 1);
  }
  var successEmbed = new EmbedBuilder()
    .setColor(
      `${
        solveTask.type == "task_done"
          ? "#51F73A"
          : solveTask == true
          ? "#51F73A"
          : "#F73A3A"
      }`
    )
    .setTimestamp()
    .setDescription(
      `${
        solveTask.type == "task_done"
          ? "Task done"
          : solveTask == true
          ? "Task done"
          : "Task failed"
      }(loading new task...)`
    )
    .setURL("https://open-assistant.io/?ref=turing")
    .setFooter({ text: `${getLocaleDisplayName(lang)}` });
  await interaction.editReply({
    embeds: [successEmbed],
    components: [],
  });
  setTimeout(async () => {
    var translation = await getTranlation(lang);
    await taskInteraction(interaction, lang, user, translation, client);
  }, 3000);
}
