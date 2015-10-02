'use strict';

let
    fs        = require('fs'),
    path      = require('path'),
    config    = JSON.parse(fs.readFileSync(path.normalize(__dirname + '/config.json', 'utf8'))),
    Discourse = require('discourse-api'),
    api = new Discourse(config.url, config.api.key, config.api.username);


// Obtain an array in the format "<old_id>": "post:<post_num>, topic:<topic_id>" by running an import script
// patched to `puts "\nXXX \"#{quoted_post_id}\": \"post:#{post.post_number}, topic:#{post.topic_id}\""`,
// for example after this line: https://github.com/discourse/discourse/pull/3802/files#diff-45f56f21760a426538b1ae78cdd2ab81R173
let post_id_to_post_num_and_topic = JSON.parse(fs.readFileSync(path.normalize(__dirname + '/post_id_mapping.json', 'utf8')));


let tasks = [
    function HRs(raw) {
        return raw.replace(/\r?\n\[hr]\r?\n/g, '\n\n----------\n');
    },

    // Markdown autolinks, so no need for [url=http://example.com]http://example.com[/url]
    function BBCodeAutoURL(raw) {
        return raw.replace(/\[url=(.*?)]\1\[\/url]/g, '$1');
    },

    // MyBB hyperlinks '(http://example.com)' correctly. Discourse does not - https://meta.discourse.org/t/url-auto-linking-doesnt-hyperlink-if-open-paren-precedes-the-protocol/33630/1
    function URLsInParens(raw) {
        return raw.replace(/\(([a-z]+:\/\/[^ )]+)\)/g, '([$1]($1))');
    },

    // Convert [url=...]text[/url] to Markdown
    function BBCodeURL(raw) {
        return raw.replace(/\[url=(.*?)](.*?)\[\/url]/g, '[$2]($1)');
    },

    function align(raw) {
        return raw.replace(/\[align=center](.*?)\[\/align]/g, '# $1');
    },

    function BBCodeBoldItalic(raw) {
        return raw.replace(/\[i]([^*\n]+?)\[\/i]/g, '*$1*').replace(/\[b]([^*\n]+?)\[\/b]/g, '**$1**');  // Markdown *'s don't work across newlines
    },

    function quote(raw) {

        function convertUsername(username) {
            return username.replace(/\s+/g, '_')
            .replace('Gary_Isaac_Wolf', 'Agaricus');  // TODO this would be useful for @mentions too; make configurable
        }

        return raw.replace(
            /\[quote='([^']+)'.*?pid='(\d+).*?]/g,
            function (match, username, pid) {
                return `[quote="${convertUsername(username)}`
                    + (post_id_to_post_num_and_topic[pid] ? `, ${post_id_to_post_num_and_topic[pid]}` : '')
                    + '"]';
            }
        );
    },

    // \n is enough. We don't need \r\n, and it also complicates regexps.
    function rmCRs(raw) {
        return raw.replace(/\r/g, '');
    }
];

let warningPatterns = {
    "unescaped '<' character": /</g,
    'leading spaces that bbcode ignores but Discourse formats as code': /^    +\S/mg,
    'list in BBCode format': /\[list]/g,
    'BBCode underline': /\[u]/g,  // Discourse handles that, but it may also be an underline for a converted link. TODO check only if it's in a URL?
    'blank line between nested [quote]s may force raw display': /\[quote[\s\S]+\[quote[\s\S]+\[quote/g,  // https://meta.discourse.org/t/weird-parsing-rule-for-nested-quote-preceded-by-newline/33679/3
    'potential missing attachment': /attach/g,
    'link to MyBB post/thread': /forum\.quantifiedself\.com/g,  // TODO make this configurable
    'potential old post number reference': /post.*?#\d+/ig,  // See posts #77 and #85
    'potential code block': /\(\) \{/g,
    'potential list item without preceding newline': /[^\n]\n-\s+/mg,
    'BBCode font tag': /\[font=/mg,  // echoed raw
    'BBCode size tag': /\[size=/mg  // seems to be ignored
};

function doPostProcess() {
    let count = 0;
    let countColorUsed = 0;
    let lastPost = api.getLastPostIdSync();

    for (let id = 1; id <= lastPost; id++) {
        let post = api.getPostSync(id);
        let replaced = post.raw;
        let replacements = [];

        if (/\[color=/.test(replaced)) {
            countColorUsed++;
        }

        // Run all processing tasks.
        for (let task of tasks) {
            let result = task(replaced);
            if (result !== replaced) {
                replacements.push(task.name);
                replaced = result;
            }
        }

        // Check for warning patterns.
        let warnings = [];
        for (let warning of Object.keys(warningPatterns)) {
            let howMany = replaced.match(warningPatterns[warning]);
            if (howMany) warnings.push(warning + ` (x${howMany.length})`);
        }

        if (warnings.length) {
            console.warn(`WARNING: post ${config.url}/p/${id} contains:`, warnings.join(', '));
        }

        // If the resulting post is no longer the same, update it.
        if (replacements.length) {
            let result = api.updatePostSync(id, replaced, 'Fix formatting post-migration: ' + replacements.join(', '));
            if (result.statusCode === 200) {
                console.log(`Fixed in post ${config.url}/p/${id}:`, replacements.join(', '));
                count++;
            } else {
                console.error('Error:', result);
            }
        }
        // break;  // uncomment this and modify the for line if you only want to process a single post
    }

    console.log('\n\nTotal posts updated:', count);
    if (!countColorUsed) {
        console.log("\nNo [color=...] tags were actually used. You can uninstall the bbcode-color plugin if you don't want to allow colors.");
    }

}

console.log('Starting Discourse post-processing...');
doPostProcess();
