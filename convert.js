import { getAllFilesSync } from 'npm:get-all-files@5.0.0'
import { titleCase } from "npm:title-case@4.3.2";
import * as path from "jsr:@std/path";

/**
 * A hacky, unfinished script for converting https://www.ccel.org/a/aquinas/Summa Theologica/smt_html.zip into Markdown.
 * Here's how to use this script:
 * 
 * Dependencies
 * 1. Install Deno https://deno.com/ 
 * 2. Install Pandoc https://pandoc.org/
 * 3. Download the zip linked above.
 * 
 * Conversion
 * 1. Extract your downloaded zip to a directory called `./src`.
 * 2. Run `find ./ -iname "*.html" -type f -exec sh -c 'pandoc "${0}" -t gfm-raw_html  --wrap=none -o "${0%.html}.md"' {} \;\n\n`
 *    Markdown files should now appear in `./src`
 * 3. Then, run `deno --allow-read --allow-write ./convert.js`
 *    It will overwrite ./Summa Theologica with a close proximate. 
 *    Not the same output though; I manually modified the source files between step 5 & 6 to pretty-ify the final result.
 *    
 * NOTE: This scripts needs to be rewritten to have a proper data model of Summa in JS (class Question, class Article, class Directory) 
 * that would enable easier configuration & conversion to other formats, e.g. ePub, html
*/


let cleanTitle = (title) => {
  title = title.trim();
  if (title.slice(0, 2).toUpperCase() === "OF") {
    title = title.replace('OF ', '');
  }

  if (title.slice(0, 3).toUpperCase() === "THE") {
    title = title.replace('THE ', '');
  }

  if (title.slice(0, 2).toUpperCase() === "ON") {
    title = title.replace('ON ', '');
  }

  let cc = {
    'ONE': 1, 
    'TWO': 2, 
    'THREE': 3, 
    'FOUR': 4, 
    'FIVE': 5, 
    'SIX': 6,
    'SEVEN': 7,
    'EIGHT': 8,
    'NINE': 9,
    'TEN': 10,
    'ELEVEN': 11,
    'TWELVE': 12,
    'THIRTEEN': 13,
    'FOURTEEN': 14,
    'FIFTEEN': 15,
    'SIXTEEN': 16,
    'SEVENTEEN': 17,
    'EIGHTEEN': 18,
    'NINETEEN': 19,
    'TWENTY': 20,
  };
  for (let art of Object.keys(cc)) {
    if (title.includes(art)) {
      title = title.replace("(" + art + " ARTICLES)", '') //cc[art]
    }
  }
  if (title.includes("Question")) {
    title = title.replace(/ \(Question.+?\) /, ';');
  }

  return titleCase(title.toLowerCase().trim());
}


let buildDir = (name, start, end, dirs=new Array(250)) => {
  let dir = {
    parent: dirs[start],
    level: 0,
    children: [],
    index: 0,
    title: cleanTitle(name.replace("TREATISE ON", "").trim()).replace("Appendix", "Άppendix"),
  }
  if (dir.parent) {
    dir.parent.children.push(dir);
    let space = "";
    dir.level = dir.parent.level + 1;
    dir.index = dir.parent.children.length;
    // dir.title = dir.index + " - " + dir.title;
  }
  if (dir.level >= 1) {
    dir.title = `${start+1}. ` + dir.title;
  }
  for (let i = start; i < end; i++) {
    dirs[i] = dir;
  }
  
  return dirs;
}


let getQuestionFilename = (part, name, index) => {
  let tr = "";
  let parent = part.tr && part.tr[index];
  if (!parent) {
    console.log("!!!!!!!!", name);
  } else {
    while (parent) {
      let pt = parent.title;
      tr = path.join(pt, tr);
      parent = parent.parent;
    }
  }
  return tr + "/" + name;
}


let getTitle = (title, part) => {
  let tr = /(.+?)\(.+?(\d+).*?-(\d+)\)/;
  // The markdown heading of FS001.md (and the other questions) to determine the nesting of directories
  while (title.match(tr)) {
    let r = title.match(tr);
    title = title.replace(tr, '');
    let ne = !part.tr;
    part.tr = buildDir(
      r[1], 
      parseInt(r[2], 10) - 1,
      parseInt(r[3], 10), 
      part.tr
    );
    if (ne) {
      part.root = part.tr[0].title
    }
  }
  return cleanTitle(title);
}

let getQuestion = (part, questionIdx, txt) => {
    let titled = /###(.*)/;
    let title = titled.exec(txt)[1].trim();
    txt = txt.replace('### ' + title, '').trim();
    title = getTitle(title, part, questionIdx);
    let links = (txt.match(/### (.*)/g) || []).map(
      (link,i) => link.replace("### ", i+1 + ". ")
    )
    let i=0;
    txt = txt.replace(/### /g, function() {
      return '# ' + ++i + ". "
    });
    let name =  (questionIdx+1) + ". " + title + ".md";
    let filename = "./Summa Theologica/" + getQuestionFilename(part, name, questionIdx);

    return {
      name, 
      key: part.key,
      filename,
      index: questionIdx,
      part: part.root,
      txt,
      links
    }
}

let cleanUp = (txt) => {
  txt = txt.replace(
    /## St. Thomas Aquinas\n\n# The Summa Theologica\n\n\(Benziger Bros. edition, 1947\)\s*\nTranslated by\s*\nFathers of the English Dominican Province\s*\n-*/m, '');

  txt = txt.replace(
    /\n\s*\n\s*\n\s*\n\s*/gm, '\n\n'
  )

  txt = txt.replace(/^[^\S\r\n]+/gm, '');

  txt = txt.replace(/------------------------------------------------------------------------/g, '')

  txt = txt.replace(/This document converted to HTML on.*/g, '');

  txt = txt.replace(/.*\\<\\<.*\\>\\>.*/g, '')

  txt = txt.replace(/\n\n\n\n\n/gm, '\n');

  return txt;
}

let fixInlineLinks = (txt, filename) => {
  let regex = /\[(?:(?:Question)|(?:Article))...(?:.)?\d+.{1,5}\]\]\(.{1,10}#([A-Z][A-Z])Q(\d+)(A\d*)?(?:(?:OUTP1)|(?:THEP1))\)/;
  let e = regex.exec(txt);
  let i = 0;
  while (e) {
    let question = summa[e[1]].questions[parseInt(e[2], 10)-1];
    let a = ""
    if (e[3] && e[3].length > 1) {
      let articleIndex = parseInt(e[3].slice(1),10)-1;;
      a = ("#" + question.links[articleIndex]).replaceAll(" ", "%20");
    } 
    if (!question || i > 999) {
      console.log(e, txt)
      throw (e[1] + " " + parseInt(e[2], 10)-1) + ", question is not found.";
    }
    txt = txt.replace(regex, `[${a ? "Answer" : "Question"} ${a ? e[3].slice(1) : e[2]}](${path.relative(filename, question.filename).replace("../", "").replaceAll(" ", "%20")}${a})`)
    e = regex.exec(txt);
    i++;
  }
  return txt;
}

let fixLinks = (txt, toc) => {
  const linkRegex = toc ? 
    /\s*\[(\d+)\.\]\(.*?#([A-Z][A-Z])Q(\d+)OUTP1\)(.*)/ :
    /^\s*\[\((\d+)\)]\(#([A-Z][A-Z])Q(\d+)A(\d+)THEP1\)(.*)\n\n/m
  ;

  let e = linkRegex.exec(txt);
  while (e) {
    let questionIndex = parseInt(e[3], 10) - 1;
    let question = summa[e[2]].questions[questionIndex];
    let articleIdx;
    let article;
    if (!toc) {
      articleIdx = parseInt(e[4],10)-1;
      article = question.links[articleIdx];
    }
    let newLine = '';
    if (!article) {
      let file = "";
      if (toc) {
        file = question.filename.replace("summa/", "").replace(question.part + "/", "").replaceAll(" ", "%20");
        txt = txt.replace(linkRegex, `\n${e[1].trim()}. [${e[4].trim()}](${file})`);
      } else {
        console.error("No link in", e[2], question.name, "for article", parseInt(e[4],10)-1);
        break;
      }
    } else {
      if (articleIdx === 0) {
        newLine = '\n';
      }
      txt = txt.replace(linkRegex, `${newLine}${e[4]}. [$5](#${article.trim().replaceAll(" ", "%20")})\n`)
    }
    e = linkRegex.exec(txt);
  }
  return txt;
}

let adjustHeadings = (txt) => {

  for (let i = 1; i < 14; i++) {
    txt = txt.replace(new RegExp(`\\*\\*\\*Objection ${i}\:\\*\\*\\* `, 'g'), `###### ${i > 1 ? 'Obj.' : 'Objection'} ${i}\n`)
    txt = txt.replace(new RegExp(`\\*\\*\\*Reply to Objection ${i}\:\\*\\*\\* `, 'g'), `###### Reply Obj. ${i}\n`)
  }

  txt = txt.replace(/\*\*\*On the contrary,\*\*\* /g, '###### On the contrary,\n')
  txt = txt.replace(/\*\*\*I answer that,\*\*\* /g, '###### I answer that,\n')

  return txt;
}

let summa = {
  "FP": {
    key: "FP",
  },
  "FS": {
    key: "FS",
  },
  "SS": {
    key: "SS",
  },
  "TP": {
    key: "TP",
  },
  "XP": {
    key: "XP",
  },
  "X1": {
    key: "X1",
  },
  "X2": {
    key: "X2",
  },
}

let init = () => {
  try {
    Deno.removeSync("./Summa Theologica/", { recursive: true });
  } catch(e) {
    console.log(e);
  }
  
  let files = getAllFilesSync(`./src`).toArray();
  files.sort()
  let postp = [];
  for (const filename of files) {
    if (filename.slice(-3) !== '.md') {
      continue;
    }
    let txt = Deno.readTextFileSync(filename);
    txt = cleanUp(txt);
  
    let basename = path.basename(filename);
    let key = basename.slice(0,2);
    let part = summa[key];
    if (!part) {
      continue;
    }
    let base = basename.slice(2).replace(".md", "");
    if (base.length <= 3) {
      let questionIdx = parseInt(base, 10);
      if (!isNaN(questionIdx)) {
        questionIdx--;
        let question = getQuestion(part, questionIdx, txt);
        if (!part.questions) {
          part.questions = [];
        }
        part.questions.push(question);
        continue;
      }
    }
    postp.push({
      txt, part, base, basename, key
    })
  }

  for (let l in summa) {
    for (let question of summa[l].questions) {
      question.txt = 
        adjustHeadings(
          fixInlineLinks(
           fixLinks(question.txt), question.filename
        )
      );

      Deno.mkdirSync(path.dirname(question.filename), { recursive: true });
      Deno.writeTextFileSync(question.filename, question.txt);
    }
  }

  for (let { txt, part, base, basename, key} of postp) {
    let newfilename = "./Summa Theologica/" + (part.root || "Άppendix") + "/";
    if (basename === "FP-Prologue.md") {
      newfilename = "./Summa Theologica/Prologue.md";
    } else if (basename === "SS-PROLOGUE.md") {
      newfilename += "Prologue of the Second Part of the Second Part.md";
    } else if (basename === "XP-NOTE.MD") {
      newfilename += "Editor's note.md";
    } else {
      let a = {
        'FP.md': 'Treatises of the First Part.md',
        'FS.md': 'Treatises of the First Part of the Second Part Treatises.md',
        'FS-PROLOGUE.md': 'Prologue of the First Part of the Second Part.md',
        'SS.md': 'Treatises of the Second Part of the Second Part.md',
        'TP.md': 'Treatises of the Third Part.md',
        'XP.md': 'Treatises of the Third Part Supplement.md',
        'XP-NOTE.md': "Editor's Note.md",
        'TP-PROLOGUE.md': "Prologue of the Third Part.md",
        'X1.md': 'Appendix Note.md'
        // 'FP.md': 'First Part (Prima Pars) Treatises.md',
        // 'FS.md': 'First Part of the Second Part (Prima Secundæ Partis) Treatises.md',
        // 'SS.md': 'Second Part of the Second Part (Secunda Secundæ Partis) Treatises.md',
        // 'TP.md': 'Third Part (Tertia Pars) Treatises.md',
        // 'XP.md': 'Third Part Supplement (Supplementum Tertiæ Partis) Treatises.md',
      }
      newfilename += (a[basename] || basename);
      txt = fixLinks(txt, true);
    }
    Deno.mkdirSync(path.dirname(newfilename), { recursive: true });
    Deno.writeTextFileSync(newfilename, txt);
  }
}

init();