import XRegExp from "xregexp";
// @ts-ignore
import pinyinConverter from "chinese-to-pinyin";
import mustache from "mustache";
import Database, { IVocab, ISentence } from ".";
import cheerio from "cheerio";
import fetch from "node-fetch";

export class TemplateResource {
    public static async get(templateName: string): Promise<ITemplate | null> {
        const m = new RegExp("^([^/]+)(?:/([^/]+))").exec(templateName);

        if (m) {
            if (m[1] === "v" && XRegExp("\\p{Han}").test(m[2])) {
                const vocab: string = m[2];
                const templateToken = await TemplateResource.fromVocab(vocab);

                for (const tNameRegex of Object.keys(templateMap)) {
                    const mTemplate = new RegExp(tNameRegex).exec(templateName);

                    if (mTemplate) {
                        const template = templateMap[tNameRegex];
                        const output = {} as any;

                        Object.keys(template).forEach((k) => {
                            output[k] = mustache.render((template as any)[k], {
                                v: templateToken.v[parseInt(mTemplate[1] || "0")],
                                s: templateToken.s,
                                m: mTemplate
                            });
                        });

                        return output as ITemplate;
                    }
                }
            }
        }

        return null;
    }

    public static async fromVocab(vocab: string) {
        const db = new Database();

        let v: IVocab[] = await db.vocab.aggregate([
            {$match: {$or: [
                {simplified: vocab},
                {traditional: vocab}
            ]}},
            {$lookup: {
                from: "token",
                localField: "simplified",
                foreignField: "entry",
                as: "t"
            }},
            {$unwind: {
                path: "$t",
                preserveNullAndEmptyArrays: true
            }},
            {$project: {
                simplified: 1,
                traditional: 1,
                pinyin: 1,
                english: 1,
                frequency: "$t.frequency"
            }}
        ]).sort({frequency: -1}).toArray();

        if (v.length === 0) {
            v = [{
                simplified: vocab,
                pinyin: pinyinConverter(vocab)
            }];
        } else {
            const newV = v.filter((el) => {
                return (el.english ? !/^variant of/i.test(el.english) && !/^surname /i.test(el.english) : true &&
                el.pinyin[0] === el.pinyin[0].toLocaleLowerCase());
            });
            v = newV.length > 0 ? newV : v;
        }

        let s: ISentence[] = await db.sentence.find({chinese: {$regex: XRegExp.escape(vocab)}}).limit(10).toArray();

        if (s.length === 0) {
            s = await getOnlineSentence(vocab);
            try {
                await db.sentence.insertMany(s.map((el) => {
                    return {
                        ...el,
                        source: "jukuu"
                    } as ISentence;
                }), {ordered: false});
            } catch (e) {}
        }

        return {v, s};
    }
}

export interface ITemplate {
    front?: string;
    back?: string;
    note?: string;
}

export interface ITemplateMap {
    [key: string]: ITemplate;
}

export const templateMap = {
    "^v/[^/]+(?:/(\\d+))?$": {
        front: "### {{{v.english}}}",
        back: `
## {{{v.simplified}}}

{{#v.traditional}}### {{{v.traditional}}}
{{/v.traditional}}
{{{v.pinyin}}}

{{#s}}
- {{{chinese}}}
    - {{{english}}}
{{/s}}`.trim()
    }
} as ITemplateMap;

export async function getOnlineSentence(v: string): Promise<ISentence[]> {
    const url = new URL("http://www.jukuu.com/search.php");
    url.searchParams.set("q", v);
    const $ = cheerio.load(await (await fetch(url.href)).text());
    const cs = $("tr.c").toArray();
    const es = $("tr.e").toArray();
    const out = [] as any[];

    cs.forEach((_, i) => {
        out.push({
            chinese: $(cs[i]).text().trim(),
            english: $(es[i]).text().replace(/^\d+\. +/, "").trim()
        });
    });

    return out;
}

export default TemplateResource;
