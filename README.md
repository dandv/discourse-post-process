# Process Discourse posts

This Node.js script uses the [Discourse API](https://meta.discourse.org/t/discourse-api-documentation/22706) (via the [discourse-api module](https://www.npmjs.com/package/discourse-api)) to process posts in a Discourse forum. It will:

* apply a set of regexp-based transformations, such as replacing [BBCode](https://en.wikipedia.org/wiki/BBCode) tags with Markdown, e.g. `[hr]` with `------`
* warn about patterns that may cause rendering problems, such as unconverted `[list]`s or [newlines in nested quotes](https://meta.discourse.org/t/weird-parsing-rule-for-nested-quote-preceded-by-newline/33679).

I've tested the script manually on [400+](http://discourse.quantifiedselfforum.com/zeo) posts migrated from MyBB and am quite satisfied with it.

It can also delete users from a list of filters, which is useful to clean up spammers coming from a given domain or matching some email address pattern.

## Dependencies

The script uses ES6 features and thus requires Node v4 or later.


## Usage

Simply clone this repo and edit the script to select which transformations and warning checks you'd like to be run.

### Note on topic activity

Note that processing posts will generate (faux) activity in their topic. If the script fixes issues in a bunch of old posts, those will show up at the top of the forum's homepage, even though no "real" activity has occurred.
 
The recommended way to deal with this is to either,
 
* process all posts ASAP, at once, before actual users come visit the site
* process a small number of posts at large intervals, e.g. 5 posts per day, for many days on end.


### Fixing quotes

If you've migrated from MyBB before Discourse accepted [my pull request](https://github.com/discourse/discourse/pull/3802) to fix inline quoting for MyBB imports, [quote lines appear raw](https://meta.discourse.org/t/mybb-import-doesnt-process-on-quoted-posts-pid-and-date/27412). The script can fix these if you've already imported from MyBB (and likely from other forum engines). Here's what you need to do:

1. Obtain an array in the format ``"<old_id>": "post:<post_num>, topic:<topic_id>"`` by running an import script patched to `puts "\nXXX \"#{quoted_post_id}\": \"post:#{post.post_number}, topic:#{post.topic_id}\""` and filtering for lines starting with `XXX`. For example for the MyBB importer, you can add that line after [this line](https://github.com/discourse/discourse/pull/3802/files#diff-45f56f21760a426538b1ae78cdd2ab81R173).
2. Make sure the array is in a valid JSON file.
3. Name that file `post_id_mapping.json`. The script will read it.


### Fixing colors

BBCode supports `[color]` tags. Discourse does not, but there's a plugin for that called [bbcode-color](https://github.com/discourse/discourse-bbcode-color/). While this script could re-save posts that contain `[color]` tags, it's better to install that plugin and run `rake posts:rebake` to make sure existing posts with color tags are rendered properly. This way, no extra revisions will be created just for interpreting the `[color]` tags.


## License

MIT